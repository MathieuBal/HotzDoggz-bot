import { type AccountingWeek, SaleStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../audit/auditService.js';
import { computeIsoWeekBounds } from './week.js';
import { collectWeekReportInputs } from './weekInputs.js';
import { ratesFromConfig } from './finance.js';
import { computeWeekReport, type WeekReport } from './weekReport.js';

/** Statuts de vente "en cours" (en attente de decision) pour la semaine. */
const PENDING_STATUSES = [SaleStatus.SOUMISE, SaleStatus.EN_VERIFICATION, SaleStatus.INCOMPLETE];

export function getOpenWeek(guildConfigId: string): Promise<AccountingWeek | null> {
  return prisma.accountingWeek.findFirst({ where: { guildConfigId, status: 'OPEN' } });
}

export interface WeekSnapshot {
  week: AccountingWeek;
  report: WeekReport;
  pendingCount: number;
}

/** Calcule le rapport de la semaine ouverte depuis les ventes VALIDEES (§6.1). */
export async function getOpenWeekSnapshot(guildConfigId: string): Promise<WeekSnapshot | null> {
  const week = await getOpenWeek(guildConfigId);
  if (!week) return null;

  const config = await prisma.guildConfig.findUnique({
    where: { id: guildConfigId },
    select: {
      roleDirecteur: true,
      roleCoDirecteur: true,
      reserveRatePercent: true,
      bonusRatePercent: true,
      directorRatePercent: true,
    },
  });
  const directionRoleIds = [config?.roleDirecteur, config?.roleCoDirecteur].filter(
    (id): id is string => Boolean(id),
  );

  const { lines, extraRevenue } = await collectWeekReportInputs(prisma, week.id);
  const report = computeWeekReport(
    lines,
    directionRoleIds,
    extraRevenue,
    config ? ratesFromConfig(config) : undefined,
  );

  const pendingCount = await prisma.sale.count({
    where: { weekId: week.id, status: { in: PENDING_STATUSES } },
  });

  return { week, report, pendingCount };
}

export interface OpenWeekResult {
  ok: boolean;
  reason?: string;
  week?: AccountingWeek;
}

/** Ouvre une semaine comptable si aucune n'est ouverte (CDC §7.3 : /semaine ouvrir). */
export async function openWeek(
  guildConfigId: string,
  guildId: string,
  timezone: string,
): Promise<OpenWeekResult> {
  const existing = await getOpenWeek(guildConfigId);
  if (existing) {
    return { ok: false, reason: 'Une semaine est deja ouverte.' };
  }
  const { startAt, endAt } = computeIsoWeekBounds(new Date(), timezone);
  try {
    const week = await prisma.accountingWeek.create({
      data: { guildConfigId, startAt, endAt, status: 'OPEN', openGuildKey: guildId },
    });
    return { ok: true, week };
  } catch {
    return { ok: false, reason: 'Impossible d’ouvrir la semaine (conflit de verrou).' };
  }
}

export interface ResetResult {
  ok: boolean;
  reason?: string;
  deletedSales?: number;
}

/**
 * Reinitialise la semaine OUVERTE : supprime la semaine et toutes ses donnees
 * (ventes, preuves, historiques, journal, paies). Conserve la configuration,
 * les employes et la grille. Destructif — reserve au Directeur, pour les tests.
 */
export async function resetOpenWeek(
  guildConfigId: string,
  actorId: string,
  correlationId: string,
): Promise<ResetResult> {
  return prisma.$transaction(async (tx) => {
    const week = await tx.accountingWeek.findFirst({ where: { guildConfigId, status: 'OPEN' } });
    if (!week) return { ok: false, reason: 'Aucune semaine ouverte.' };

    const sales = await tx.sale.findMany({ where: { weekId: week.id }, select: { id: true } });
    const saleIds = sales.map((s) => s.id);

    if (saleIds.length > 0) {
      await tx.saleAttachment.deleteMany({ where: { saleId: { in: saleIds } } });
      await tx.saleStatusHistory.deleteMany({ where: { saleId: { in: saleIds } } });
    }
    await tx.ledgerEntry.deleteMany({
      where: { OR: [{ weekId: week.id }, { saleId: { in: saleIds } }] },
    });
    await tx.payroll.deleteMany({ where: { weekId: week.id } });
    await tx.sale.deleteMany({ where: { weekId: week.id } });
    await tx.accountingWeek.delete({ where: { id: week.id } });

    await writeAudit(tx, {
      guildConfigId,
      action: 'WEEK_RESET',
      authorDiscordId: actorId,
      entityType: 'AccountingWeek',
      entityId: week.id,
      before: { sales: saleIds.length },
      correlationId,
    });

    return { ok: true, deletedSales: saleIds.length };
  });
}
