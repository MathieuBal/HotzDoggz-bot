import { SaleStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';
import { getOpenWeekSnapshot } from '../accounting/accountingService.js';

/**
 * Donnees du tableau "Developpement de l'entreprise" (cote employes).
 * Transparence et fierte collective : croissance et activite UNIQUEMENT — jamais
 * la repartition de l'argent (benefice, reserve, salaires/primes de direction).
 */

export interface CompanyWeekStats {
  units: number; // hot dogs valides
  revenue: number; // CA brut (valide)
  salesCount: number; // ventes validees
  activeSellers: number; // employes distincts ayant une vente validee
}

export interface CompanyBoardData {
  weekStart: Date;
  weekEnd: Date;
  current: CompanyWeekStats;
  previous: CompanyWeekStats | null; // derniere semaine cloturee (comparaison)
  newEmployees: string[]; // nomRP des embauches de la semaine
  promotions: { nomRP: string; toLabel: string }[]; // promotions de la semaine
  topSellers: { nomRP: string; quantity: number }[]; // hors direction, top 3
}

/** Stats d'activite d'une semaine donnee, calculees depuis les ventes validees. */
async function weekStats(weekId: string): Promise<CompanyWeekStats> {
  const sales = await prisma.sale.findMany({
    where: { weekId, status: SaleStatus.VALIDEE },
    select: { employeeId: true, validatedQuantity: true, pnjUnitPriceSnapshot: true },
  });
  let units = 0;
  let revenue = 0;
  const sellers = new Set<string>();
  for (const s of sales) {
    const q = s.validatedQuantity ?? 0;
    units += q;
    revenue += q * (s.pnjUnitPriceSnapshot ?? 0);
    sellers.add(s.employeeId);
  }
  return { units, revenue, salesCount: sales.length, activeSellers: sellers.size };
}

/**
 * Construit les donnees du tableau pour la semaine ouverte, comparees a la
 * derniere semaine cloturee. Retourne null si aucune semaine n'est ouverte.
 */
export async function getCompanyBoardData(guildConfigId: string): Promise<CompanyBoardData | null> {
  const snapshot = await getOpenWeekSnapshot(guildConfigId);
  if (!snapshot) return null;
  const { week, report } = snapshot;

  const current: CompanyWeekStats = {
    units: report.employees.reduce((s, e) => s + e.quantity, 0),
    revenue: report.totalRevenue,
    salesCount: await prisma.sale.count({
      where: { weekId: week.id, status: SaleStatus.VALIDEE },
    }),
    activeSellers: report.employees.filter((e) => e.quantity > 0).length,
  };

  const previousWeek = await prisma.accountingWeek.findFirst({
    where: { guildConfigId, status: 'CLOSED' },
    orderBy: { endAt: 'desc' },
    select: { id: true },
  });
  const previous = previousWeek ? await weekStats(previousWeek.id) : null;

  const newHires = await prisma.employee.findMany({
    where: {
      guildConfigId,
      status: 'ACTIVE',
      createdAt: { gte: week.startAt, lte: week.endAt },
    },
    select: { nomRP: true },
    orderBy: { createdAt: 'asc' },
  });

  const gradeEvents = await prisma.employeeGradeEvent.findMany({
    where: {
      guildConfigId,
      createdAt: { gte: week.startAt, lte: week.endAt },
      fromRate: { not: null }, // exclut le premier grade connu (embauche)
    },
    select: { toLabel: true, toRate: true, fromRate: true, employee: { select: { nomRP: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const promotions = gradeEvents
    .filter((e) => e.fromRate !== null && e.toRate > e.fromRate) // promotion = tarif en hausse
    .map((e) => ({ nomRP: e.employee.nomRP, toLabel: e.toLabel }));

  const topSellers = report.employees
    .filter((e) => e.eligible && e.quantity > 0)
    .slice(0, 3)
    .map((e) => ({ nomRP: e.nomRP, quantity: e.quantity }));

  return {
    weekStart: week.startAt,
    weekEnd: week.endAt,
    current,
    previous,
    newEmployees: newHires.map((h) => h.nomRP),
    promotions,
    topSellers,
  };
}
