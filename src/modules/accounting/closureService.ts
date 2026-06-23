import { LedgerEntryType, PayrollStatus, SaleStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../audit/auditService.js';
import { collectWeekReportInputs } from './weekInputs.js';
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

    const { lines, extraRevenue } = await collectWeekReportInputs(tx, week.id);
    const report = computeWeekReport(lines, directionRoleIds, extraRevenue);
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

    // Avances versees durant la semaine (deduites du net a payer).
    const advanceRows = await tx.salaryAdvance.groupBy({
      by: ['employeeId'],
      where: { weekId: week.id, status: 'ACTIVE' },
      _sum: { amount: true },
    });
    const advancesByEmployee = new Map<string, number>(
      advanceRows.map((r) => [r.employeeId, r._sum.amount ?? 0]),
    );

    // Fiches de paie par employe (salaire + prime − acomptes deja verses).
    // Inclut aussi un employe qui aurait recu une avance sans vente retenue.
    const employeeIds = new Set<string>([
      ...report.employees.map((e) => e.employeeId),
      ...advancesByEmployee.keys(),
    ]);
    const salaryById = new Map(report.employees.map((e) => [e.employeeId, e.salary]));
    if (employeeIds.size > 0) {
      await tx.payroll.createMany({
        data: [...employeeIds].map((employeeId) => {
          const salary = salaryById.get(employeeId) ?? 0;
          const bonus = bonusShares.get(employeeId) ?? 0;
          const total = salary + bonus;
          const advanced = advancesByEmployee.get(employeeId) ?? 0;
          // Plus rien a verser si l'acompte couvre deja le total -> regle.
          const settled = advanced >= total;
          return {
            guildConfigId,
            employeeId,
            weekId: week.id,
            salaryAmount: salary,
            bonusAmount: bonus,
            advancedAmount: advanced,
            totalAmount: total,
            status: settled ? PayrollStatus.PAID : PayrollStatus.PENDING,
            paidAt: settled ? new Date() : null,
            payerDiscordId: settled ? actorId : null,
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

    // Integre les ventes validees a la paie (PNJ + main en main).
    await tx.sale.updateMany({
      where: { weekId: week.id, status: SaleStatus.VALIDEE },
      data: { status: SaleStatus.INTEGREE_A_LA_PAIE },
    });
    await tx.directSale.updateMany({
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
