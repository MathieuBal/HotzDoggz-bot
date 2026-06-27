import { ClientOrderStatus, LedgerEntryType, SaleStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../audit/auditService.js';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };
const fail = (reason: string): ActionResult<never> => ({ ok: false, reason });
const done = <T>(data: T): ActionResult<T> => ({ ok: true, data });

// Allocations propres a la cloture (a defaire en cas de reouverture).
const CLOSURE_LEDGER_TYPES = [
  LedgerEntryType.RESERVE_ALLOCATION,
  LedgerEntryType.BONUS_ALLOCATION,
  LedgerEntryType.DIRECTION_ALLOCATION,
];

/**
 * Rouvre la derniere semaine cloturee pour corriger une erreur (CDC §10.3).
 * Defait la cloture : supprime fiches de paie + allocations de cloture, repasse
 * les ventes integrees en VALIDEE, remet la semaine OUVERTE. La compta sera
 * recalculee depuis la source (ventes/commandes) — rien n'est perdu. Refuse si
 * une paie a deja ete versee (argent distribue) ou si une semaine est ouverte.
 */
export async function reopenLastClosedWeek(
  guildConfigId: string,
  guildId: string,
  actorId: string,
  correlationId: string,
): Promise<ActionResult<{ weekId: string }>> {
  return prisma.$transaction(async (tx) => {
    const open = await tx.accountingWeek.findFirst({ where: { guildConfigId, status: 'OPEN' } });
    if (open) {
      return fail(
        'Une semaine est déjà ouverte. Clôture-la d’abord (ou termine la semaine en cours).',
      );
    }
    const week = await tx.accountingWeek.findFirst({
      where: { guildConfigId, status: 'CLOSED' },
      orderBy: { closedAt: 'desc' },
    });
    if (!week) return fail('Aucune semaine clôturée à rouvrir.');

    const paid = await tx.payroll.count({ where: { weekId: week.id, status: 'PAID' } });
    if (paid > 0) {
      return fail('Des paies ont déjà été versées sur cette semaine : réouverture impossible.');
    }

    await tx.payroll.deleteMany({ where: { weekId: week.id } });
    await tx.ledgerEntry.deleteMany({
      where: { weekId: week.id, type: { in: CLOSURE_LEDGER_TYPES } },
    });
    // Les ventes integrees redeviennent actives (recomptees par la compta).
    await tx.sale.updateMany({
      where: { weekId: week.id, status: SaleStatus.INTEGREE_A_LA_PAIE },
      data: { status: SaleStatus.VALIDEE },
    });
    await tx.directSale.updateMany({
      where: { weekId: week.id, status: SaleStatus.INTEGREE_A_LA_PAIE },
      data: { status: SaleStatus.VALIDEE },
    });

    await tx.accountingWeek.update({
      where: { id: week.id },
      data: {
        status: 'OPEN',
        openGuildKey: guildId,
        totalRevenue: null,
        totalSalaries: null,
        reserve: null,
        distributable: null,
        bonus: null,
        directorShare: null,
        coDirectorShare: null,
        bestEmployeeId: null,
        closedAt: null,
        closedByDiscordId: null,
      },
    });

    await writeAudit(tx, {
      guildConfigId,
      action: 'WEEK_REOPENED',
      authorDiscordId: actorId,
      entityType: 'AccountingWeek',
      entityId: week.id,
      correlationId,
    });
    return done({ weekId: week.id });
  });
}

/**
 * Annule une commande client erronee, meme deja payee (correction). La passe en
 * ANNULEE (la compta cesse de la compter) et inscrit un ajustement au journal.
 */
export async function adminCancelOrder(
  guildConfigId: string,
  reference: string,
  actorId: string,
  reason: string,
  correlationId: string,
): Promise<ActionResult<{ reference: string }>> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.clientOrder.findFirst({ where: { guildConfigId, reference } });
    if (!order) return fail(`Commande ${reference} introuvable.`);
    if (order.status === ClientOrderStatus.ANNULEE) return fail('Commande déjà annulée.');

    const wasPaid = order.status === ClientOrderStatus.PAYEE;
    await tx.clientOrder.update({
      where: { id: order.id },
      data: { status: ClientOrderStatus.ANNULEE },
    });
    // Contre-passation si la commande etait deja comptee : son CA a ete inscrit
    // en SALE_REVENUE (+negotiatedPrice) a la livraison, l'annuler doit donc
    // retrancher ce montant. Journal signe → ajustement NEGATIF (cf. correctSale
    // et cancelLastAdvance).
    if (wasPaid && order.weekId) {
      await tx.ledgerEntry.create({
        data: {
          guildConfigId,
          type: LedgerEntryType.ADJUSTMENT,
          amount: -order.negotiatedPrice,
          weekId: order.weekId,
          description: `Annulation commande ${order.reference} (${reason})`,
          correlationId,
        },
      });
    }
    await writeAudit(tx, {
      guildConfigId,
      action: 'ORDER_CANCELLED_ADMIN',
      authorDiscordId: actorId,
      entityType: 'ClientOrder',
      entityId: order.id,
      reason,
      correlationId,
    });
    return done({ reference: order.reference });
  });
}

/**
 * Annule une vente erronee (PNJ `HD-` ou main en main `VD-`), validee ou integree.
 * La passe en ANNULEE : la compta cesse de la compter au prochain calcul.
 */
export async function adminCancelSale(
  guildConfigId: string,
  reference: string,
  actorId: string,
  reason: string,
  correlationId: string,
): Promise<ActionResult<{ reference: string }>> {
  const ref = reference.trim().toUpperCase();
  const cancellable: SaleStatus[] = [
    SaleStatus.VALIDEE,
    SaleStatus.INTEGREE_A_LA_PAIE,
    SaleStatus.SOUMISE,
  ];

  if (ref.startsWith('VD-')) {
    return prisma.$transaction(async (tx) => {
      const sale = await tx.directSale.findFirst({ where: { guildConfigId, reference: ref } });
      if (!sale) return fail(`Vente ${ref} introuvable.`);
      if (!cancellable.includes(sale.status)) {
        return fail(`Vente non annulable depuis le statut ${sale.status}.`);
      }
      await tx.directSale.update({ where: { id: sale.id }, data: { status: SaleStatus.ANNULEE } });
      await writeAudit(tx, {
        guildConfigId,
        action: 'DIRECT_SALE_CANCELLED_ADMIN',
        authorDiscordId: actorId,
        entityType: 'DirectSale',
        entityId: sale.id,
        reason,
        correlationId,
      });
      return done({ reference: sale.reference });
    });
  }

  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { guildConfigId, reference: ref } });
    if (!sale) return fail(`Vente ${ref} introuvable.`);
    if (!cancellable.includes(sale.status)) {
      return fail(`Vente non annulable depuis le statut ${sale.status}.`);
    }
    await tx.sale.update({ where: { id: sale.id }, data: { status: SaleStatus.ANNULEE } });
    await writeAudit(tx, {
      guildConfigId,
      action: 'SALE_CANCELLED_ADMIN',
      authorDiscordId: actorId,
      entityType: 'Sale',
      entityId: sale.id,
      reason,
      correlationId,
    });
    return done({ reference: sale.reference });
  });
}
