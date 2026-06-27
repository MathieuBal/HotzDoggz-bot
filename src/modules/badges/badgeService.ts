import { OrderContributionStatus, SaleStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';
import {
  badgeByKey,
  contributionBadgesReached,
  revenueBadgesReached,
  unitBadgesReached,
  type BadgeDef,
} from './registry.js';

/**
 * Attribution et lecture des badges. L'attribution est idempotente (contrainte
 * unique (employeeId, badgeKey) + skipDuplicates) : un badge ne se gagne qu'une
 * fois, et un appel concurrent ne cree pas de doublon.
 */

const COUNTED = [SaleStatus.VALIDEE, SaleStatus.INTEGREE_A_LA_PAIE, SaleStatus.PAYEE];

/** Stats cumulees (unites validees + CA genere, ventes PNJ) d'un employe. */
async function cumulativeStats(employeeId: string): Promise<{ units: number; revenue: number }> {
  const sales = await prisma.sale.findMany({
    where: { employeeId, status: { in: COUNTED } },
    select: { validatedQuantity: true, pnjUnitPriceSnapshot: true },
  });
  let units = 0;
  let revenue = 0;
  for (const s of sales) {
    const q = s.validatedQuantity ?? 0;
    units += q;
    revenue += q * (s.pnjUnitPriceSnapshot ?? 0);
  }
  return { units, revenue };
}

/**
 * Attribue les badges `defs` encore manquants a l'employe. Idempotent (contrainte
 * unique + skipDuplicates). Retourne uniquement les badges NOUVELLEMENT debloques.
 */
async function awardBadges(
  guildConfigId: string,
  employeeId: string,
  defs: readonly BadgeDef[],
): Promise<BadgeDef[]> {
  if (defs.length === 0) return [];
  const existing = await prisma.employeeBadge.findMany({
    where: { employeeId },
    select: { badgeKey: true },
  });
  const have = new Set(existing.map((e) => e.badgeKey));
  const fresh = defs.filter((b) => !have.has(b.key));
  if (fresh.length === 0) return [];

  await prisma.employeeBadge.createMany({
    data: fresh.map((b) => ({ guildConfigId, employeeId, badgeKey: b.key })),
    skipDuplicates: true,
  });
  return fresh;
}

/** Paliers de PRODUCTION (unites) ET de CA franchis -> badges debloques. */
export async function checkAndAwardBadges(
  guildConfigId: string,
  employeeId: string,
): Promise<BadgeDef[]> {
  const { units, revenue } = await cumulativeStats(employeeId);
  return awardBadges(guildConfigId, employeeId, [
    ...unitBadgesReached(units),
    ...revenueBadgesReached(revenue),
  ]);
}

/** Paliers de CONTRIBUTION (commandes clients) franchis -> badges debloques. */
export async function checkAndAwardContributionBadges(
  guildConfigId: string,
  employeeId: string,
): Promise<BadgeDef[]> {
  const count = await prisma.orderContribution.count({
    where: { employeeId, status: OrderContributionStatus.ACTIVE },
  });
  return awardBadges(guildConfigId, employeeId, contributionBadgesReached(count));
}

/** Attribue un badge special (evenementiel) par sa cle, si pas deja obtenu. */
export async function awardSpecialBadge(
  guildConfigId: string,
  employeeId: string,
  badgeKey: string,
): Promise<BadgeDef[]> {
  const def = badgeByKey(badgeKey);
  return def ? awardBadges(guildConfigId, employeeId, [def]) : [];
}

/** Badges obtenus par un employe, dans l'ordre d'obtention. */
export async function listEmployeeBadges(employeeId: string): Promise<BadgeDef[]> {
  const rows = await prisma.employeeBadge.findMany({
    where: { employeeId },
    orderBy: { awardedAt: 'asc' },
    select: { badgeKey: true },
  });
  return rows.map((r) => badgeByKey(r.badgeKey)).filter((b): b is BadgeDef => b !== undefined);
}
