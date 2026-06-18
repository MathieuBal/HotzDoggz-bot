import { LedgerEntryType, SaleStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../audit/auditService.js';
import { computeBonusShares, computeWeekReport } from './weekReport.js';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const PENDING = [SaleStatus.SOUMISE, SaleStatus.EN_VERIFICATION, SaleStatus.INCOMPLETE];

export interface ClosureSummary {
  weekId: string;
  totalRevenue: number;
  totalSalaries: number;
  reserve: number;
  distributable: number;
  bonus: number;
  directorShare: number;
  coDirectorShare: number;
  bestEmployeeName: string | null;
  bestTie: boolean;
  payrollCount: number;
  forced: boolean;
}

/**
 * Cloture de semaine (CDC §6.6) : verrouille les totaux definitifs, identifie le
 * meilleur employe, cree les fiches de paie et les allocations de direction,
 * integre les ventes validees a la paie — dans une seule transaction (§9.4).
 *
 * Mode strict : refusee tant que des ventes sont en cours. Mode force (Directeur,
 * double confirmation + motif) : passe outre, integralement audite.
 */
export async function closeWeek(
  guildConfigId: string,
  actorId: string,
  opts: { forced: boolean; reason?: string },
  correlationId: string,
): Promise<ActionResult<ClosureSummary>> {
  return prisma.$transaction(async (tx) => {
    const week = await tx.accountingWeek.findFirst({
      where: { guildConfigId, status: 'OPEN' },
    });
    if (!week) return { ok: false, reason: 'Aucune semaine ouverte.' };

    const pendingCount = await tx.sale.count({
      where: { weekId: week.id, status: { in: PENDING } },
    });
    if (!opts.forced && pendingCount > 0) {
      return {
        ok: false,
        reason: `Cloture refusee : ${pendingCount} vente(s) encore en cours. Traite-les ou utilise la cloture forcee.`,
      };
    }
    if (opts.forced && !opts.reason) {
      return { ok: false, reason: 'Motif obligatoire pour une cloture forcee.' };
    }

    const config = await tx.guildConfig.findUnique({
      where: { id: guildConfigId },
      select: { roleDirecteur: true, roleCoDirecteur: true },
    });
    const directionRoleIds = [config?.roleDirecteur, config?.roleCoDirecteur].filter(
      (id): id is string => Boolean(id),
    );

    const sales = await tx.sale.findMany({
      where: { weekId: week.id, status: SaleStatus.VALIDEE },
      select: {
        employeeId: true,
        validatedQuantity: true,
        salaryRateSnapshot: true,
        pnjUnitPriceSnapshot: true,
        gradeRoleIdSnapshot: true,
        gradeSnapshot: true,
        employee: { select: { nomRP: true } },
      },
    });

    const report = computeWeekReport(
      sales.map((s) => ({
        employeeId: s.employeeId,
        nomRP: s.employee.nomRP,
        validatedQuantity: s.validatedQuantity ?? 0,
        salaryRate: s.salaryRateSnapshot ?? 0,
        pnjUnitPrice: s.pnjUnitPriceSnapshot ?? 0,
        gradeRoleId: s.gradeRoleIdSnapshot,
        gradeLabel: s.gradeSnapshot,
      })),
      directionRoleIds,
    );
    const bonusShares = computeBonusShares(report);

    // Verrouille les totaux sur la semaine et libere le verrou d'ouverture.
    await tx.accountingWeek.update({
      where: { id: week.id },
      data: {
        status: 'CLOSED',
        openGuildKey: null,
        totalRevenue: report.totalRevenue,
        totalSalaries: report.totalSalaries,
        reserve: report.reserve,
        distributable: report.distributable,
        bonus: report.bonus,
        directorShare: report.directorShare,
        coDirectorShare: report.coDirectorShare,
        bestEmployeeId: report.bestEmployee?.employeeId ?? null,
        closedAt: new Date(),
        closedByDiscordId: actorId,
      },
    });

    // Fiches de paie par employe (salaire de production + part de prime).
    if (report.employees.length > 0) {
      await tx.payroll.createMany({
        data: report.employees.map((e) => {
          const bonus = bonusShares.get(e.employeeId) ?? 0;
          return {
            guildConfigId,
            employeeId: e.employeeId,
            weekId: week.id,
            salaryAmount: e.salary,
            bonusAmount: bonus,
            totalAmount: e.salary + bonus,
          };
        }),
      });
    }

    // Allocations de cloture dans le journal financier (§6.3).
    await tx.ledgerEntry.createMany({
      data: [
        {
          guildConfigId,
          type: LedgerEntryType.RESERVE_ALLOCATION,
          amount: report.reserve,
          weekId: week.id,
          description: 'Reserve de securite (5 %)',
          correlationId,
        },
        {
          guildConfigId,
          type: LedgerEntryType.BONUS_ALLOCATION,
          amount: report.bonus,
          weekId: week.id,
          description: 'Prime du meilleur employe',
          correlationId,
        },
        {
          guildConfigId,
          type: LedgerEntryType.DIRECTION_ALLOCATION,
          amount: report.directorShare,
          weekId: week.id,
          description: 'Part Directeur (40 %)',
          correlationId,
        },
        {
          guildConfigId,
          type: LedgerEntryType.DIRECTION_ALLOCATION,
          amount: report.coDirectorShare,
          weekId: week.id,
          description: 'Part Co-directeur (25 %)',
          correlationId,
        },
      ],
    });

    // Integre les ventes validees a la paie.
    await tx.sale.updateMany({
      where: { weekId: week.id, status: SaleStatus.VALIDEE },
      data: { status: SaleStatus.INTEGREE_A_LA_PAIE },
    });

    await writeAudit(tx, {
      guildConfigId,
      action: opts.forced ? 'WEEK_CLOSED_FORCED' : 'WEEK_CLOSED',
      authorDiscordId: actorId,
      entityType: 'AccountingWeek',
      entityId: week.id,
      reason: opts.reason ?? null,
      after: {
        totalRevenue: report.totalRevenue,
        totalSalaries: report.totalSalaries,
        reserve: report.reserve,
        distributable: report.distributable,
        bonus: report.bonus,
        directorShare: report.directorShare,
        coDirectorShare: report.coDirectorShare,
        pendingForced: opts.forced ? pendingCount : 0,
      },
      correlationId,
    });

    return {
      ok: true,
      data: {
        weekId: week.id,
        totalRevenue: report.totalRevenue,
        totalSalaries: report.totalSalaries,
        reserve: report.reserve,
        distributable: report.distributable,
        bonus: report.bonus,
        directorShare: report.directorShare,
        coDirectorShare: report.coDirectorShare,
        bestEmployeeName: report.bestEmployee?.nomRP ?? null,
        bestTie: report.bestTie,
        payrollCount: report.employees.length,
        forced: opts.forced,
      },
    };
  });
}
