import { SaleStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';

/**
 * Classement all-time des vendeurs (ventes PNJ validees), pour la boucle de
 * feedback joueur : rendre visible et motivant qui produit le plus. Lecture
 * seule, agregee en base.
 */

export interface RankEntry {
  nomRP: string;
  units: number;
  revenue: number;
}

// Ventes "comptees" (validee et au-dela) — meme convention que la fiche profil.
const COUNTED = [SaleStatus.VALIDEE, SaleStatus.INTEGREE_A_LA_PAIE, SaleStatus.PAYEE];

/**
 * Top vendeurs par unites validees cumulees (ventes PNJ). Sans `weekId` :
 * classement all-time ; avec `weekId` : classement de la semaine donnee.
 */
export async function getTopSellers(
  guildConfigId: string,
  limit = 10,
  weekId?: string,
): Promise<RankEntry[]> {
  const where = { guildConfigId, status: { in: COUNTED }, ...(weekId ? { weekId } : {}) };
  const grouped = await prisma.sale.groupBy({
    by: ['employeeId'],
    where,
    _sum: { validatedQuantity: true },
    orderBy: { _sum: { validatedQuantity: 'desc' } },
    take: Math.min(Math.max(1, limit), 25),
  });
  if (grouped.length === 0) return [];

  // Noms RP en une requete (pas de N+1).
  const employees = await prisma.employee.findMany({
    where: { id: { in: grouped.map((g) => g.employeeId) } },
    select: { id: true, nomRP: true },
  });
  const nameById = new Map(employees.map((e) => [e.id, e.nomRP]));

  // CA par employe : on somme quantite x prix snapshote (l'aggregate ne sait pas
  // multiplier deux colonnes). Volume borne par le top N, donc peu de lignes.
  const sales = await prisma.sale.findMany({
    where: { ...where, employeeId: { in: grouped.map((g) => g.employeeId) } },
    select: { employeeId: true, validatedQuantity: true, pnjUnitPriceSnapshot: true },
  });
  const revenueById = new Map<string, number>();
  for (const s of sales) {
    const r = (s.validatedQuantity ?? 0) * (s.pnjUnitPriceSnapshot ?? 0);
    revenueById.set(s.employeeId, (revenueById.get(s.employeeId) ?? 0) + r);
  }

  return grouped.map((g) => ({
    nomRP: nameById.get(g.employeeId) ?? '—',
    units: g._sum.validatedQuantity ?? 0,
    revenue: revenueById.get(g.employeeId) ?? 0,
  }));
}

/** Rendu texte du classement (pur, testable) : medailles + unites + CA. */
export function formatLeaderboard(entries: readonly RankEntry[]): string {
  if (entries.length === 0) return '_Aucune vente validée pour le moment._';
  const nf = new Intl.NumberFormat('fr-FR');
  const medals = ['🥇', '🥈', '🥉'];
  return entries
    .map(
      (e, i) =>
        `${medals[i] ?? `**${i + 1}.**`} **${e.nomRP}** — ${nf.format(e.units)} u · ${nf.format(e.revenue)} $`,
    )
    .join('\n');
}
