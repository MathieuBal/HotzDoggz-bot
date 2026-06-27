import { SaleStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';
import { badgeByKey, unitBadgesReached, type BadgeDef } from './registry.js';

/**
 * Attribution et lecture des badges. L'attribution est idempotente (contrainte
 * unique (employeeId, badgeKey) + skipDuplicates) : un badge ne se gagne qu'une
 * fois, et un appel concurrent ne cree pas de doublon.
 */

const COUNTED = [SaleStatus.VALIDEE, SaleStatus.INTEGREE_A_LA_PAIE, SaleStatus.PAYEE];

/** Production cumulee (unites validees, ventes PNJ) d'un employe. */
async function cumulativeUnits(employeeId: string): Promise<number> {
  const agg = await prisma.sale.aggregate({
    where: { employeeId, status: { in: COUNTED } },
    _sum: { validatedQuantity: true },
  });
  return agg._sum.validatedQuantity ?? 0;
}

/**
 * Verifie les paliers de production de l'employe et attribue les badges encore
 * manquants. Retourne uniquement les badges NOUVELLEMENT debloques (pour annonce).
 */
export async function checkAndAwardBadges(
  guildConfigId: string,
  employeeId: string,
): Promise<BadgeDef[]> {
  const units = await cumulativeUnits(employeeId);
  const reached = unitBadgesReached(units);
  if (reached.length === 0) return [];

  const existing = await prisma.employeeBadge.findMany({
    where: { employeeId },
    select: { badgeKey: true },
  });
  const have = new Set(existing.map((e) => e.badgeKey));
  const fresh = reached.filter((b) => !have.has(b.key));
  if (fresh.length === 0) return [];

  await prisma.employeeBadge.createMany({
    data: fresh.map((b) => ({ guildConfigId, employeeId, badgeKey: b.key })),
    skipDuplicates: true,
  });
  return fresh;
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
