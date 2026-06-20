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

/** Total livre a un partenaire = unites produites sur ses commandes payees. */
export async function deliveredToPartner(partnerId: string): Promise<number> {
  const agg = await prisma.orderContribution.aggregate({
    where: {
      status: OrderContributionStatus.ACTIVE,
      order: { partnerId, status: ClientOrderStatus.PAYEE },
    },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

export interface PartnerProgress {
  name: string;
  target: number | null;
  delivered: number;
  reached: boolean;
}

/** Donnees du tableau d'objectifs : progression de chaque partenaire actif. */
export async function getPartnershipBoardData(guildConfigId: string): Promise<PartnerProgress[]> {
  const partners = await listActivePartners(guildConfigId);
  const rows: PartnerProgress[] = [];
  for (const p of partners) {
    const delivered = await deliveredToPartner(p.id);
    rows.push({
      name: p.name,
      target: p.objectiveTarget,
      delivered,
      reached: p.objectiveTarget !== null && delivered >= p.objectiveTarget,
    });
  }
  return rows;
}
