import { type AccountingWeek, SaleStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';
import { computeIsoWeekBounds } from './week.js';
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
    select: { roleDirecteur: true, roleCoDirecteur: true },
  });
  const directionRoleIds = [config?.roleDirecteur, config?.roleCoDirecteur].filter(
    (id): id is string => Boolean(id),
  );

  const sales = await prisma.sale.findMany({
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
