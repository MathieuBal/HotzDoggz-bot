import { ClientOrderStatus, OrderContributionStatus, type Partner } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export function listActivePartners(guildConfigId: string): Promise<Partner[]> {
  return prisma.partner.findMany({
    where: { guildConfigId, active: true },
    orderBy: { name: 'asc' },
  });
}

export function findActivePartnerByName(
  guildConfigId: string,
  name: string,
): Promise<Partner | null> {
  return prisma.partner.findFirst({
    where: { guildConfigId, active: true, name: { equals: name.trim(), mode: 'insensitive' } },
  });
}

/** Cree un partenaire (ou le reactive s'il existait). */
export async function createPartner(
  guildConfigId: string,
  name: string,
): Promise<ActionResult<Partner>> {
  const cleaned = name.trim();
  if (!cleaned) return { ok: false, reason: 'Nom de partenaire vide.' };
  const partner = await prisma.partner.upsert({
    where: { guildConfigId_name: { guildConfigId, name: cleaned } },
    create: { guildConfigId, name: cleaned },
    update: { active: true },
  });
  return { ok: true, data: partner };
}

/** Fixe/maj l'objectif (quantite cumulative) d'un partenaire. */
export async function setPartnerObjective(
  guildConfigId: string,
  name: string,
  target: number,
): Promise<ActionResult<Partner>> {
  if (!Number.isInteger(target) || target < 1) {
    return { ok: false, reason: 'L’objectif doit être un entier positif.' };
  }
  const partner = await findActivePartnerByName(guildConfigId, name);
  if (!partner) return { ok: false, reason: 'Partenaire introuvable.' };
  const updated = await prisma.partner.update({
    where: { id: partner.id },
    data: { objectiveTarget: target },
  });
  return { ok: true, data: updated };
}

/** Desactive un partenaire (conserve l'historique des commandes). */
export async function deactivatePartner(
  guildConfigId: string,
  name: string,
): Promise<ActionResult<Partner>> {
  const partner = await findActivePartnerByName(guildConfigId, name);
  if (!partner) return { ok: false, reason: 'Partenaire introuvable.' };
  const updated = await prisma.partner.update({
    where: { id: partner.id },
    data: { active: false },
  });
  return { ok: true, data: updated };
}

/**
 * Total livre PAR partenaire sur une semaine, en UNE seule requete (au lieu d'une
 * agregation par partenaire). On charge les contributions payees de la semaine
 * puis on additionne par partenaire en memoire => evite le N+1 sur les tableaux.
 */
export async function deliveredByPartnerInWeek(
  weekId: string,
  partnerIds: readonly string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (partnerIds.length === 0) return totals;
  const contributions = await prisma.orderContribution.findMany({
    where: {
      status: OrderContributionStatus.ACTIVE,
      order: {
        status: ClientOrderStatus.PAYEE,
        weekId,
        partnerId: { in: [...partnerIds] },
      },
    },
    select: { quantity: true, order: { select: { partnerId: true } } },
  });
  for (const c of contributions) {
    const pid = c.order.partnerId;
    if (pid) totals.set(pid, (totals.get(pid) ?? 0) + c.quantity);
  }
  return totals;
}

export interface PartnerProgress {
  name: string;
  target: number | null; // objectif hebdomadaire
  delivered: number; // livre cette semaine
  reached: boolean;
}

/**
 * Donnees du tableau d'objectifs : progression HEBDOMADAIRE de chaque partenaire
 * actif (contrat recurrent qui se reinitialise chaque semaine). Si aucune semaine
 * n'est ouverte, la progression vaut 0.
 */
export async function getPartnershipBoardData(guildConfigId: string): Promise<PartnerProgress[]> {
  const week = await prisma.accountingWeek.findFirst({
    where: { guildConfigId, status: 'OPEN' },
    select: { id: true },
  });
  const partners = await listActivePartners(guildConfigId);
  const delivered = week
    ? await deliveredByPartnerInWeek(
        week.id,
        partners.map((p) => p.id),
      )
    : new Map<string, number>();
  return partners.map((p) => {
    const d = delivered.get(p.id) ?? 0;
    return {
      name: p.name,
      target: p.objectiveTarget,
      delivered: d,
      reached: p.objectiveTarget !== null && d >= p.objectiveTarget,
    };
  });
}
