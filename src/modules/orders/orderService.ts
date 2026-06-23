import {
  ClientOrderStatus,
  LedgerEntryType,
  OrderContributionStatus,
  type SaleRisk,
} from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../audit/auditService.js';
import type { StoredAttachment } from '../sales/attachments.js';
import { allocateOrderReference } from './orderReferenceService.js';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };
const fail = (reason: string): ActionResult<never> => ({ ok: false, reason });
const done = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export interface CreateOrderInput {
  guildConfigId: string;
  clientName: string;
  description: string | null;
  targetQuantity: number;
  negotiatedPrice: number;
  deadline: Date | null;
  createdByDiscordId: string;
  partnerId?: string | null;
}

/** Cree une commande client (direction). Reference CMD-AAAA-NNNN. */
export async function createOrder(
  input: CreateOrderInput,
): Promise<ActionResult<{ id: string; reference: string }>> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const reference = await allocateOrderReference(
          tx,
          input.guildConfigId,
          new Date().getFullYear(),
        );
        const order = await tx.clientOrder.create({
          data: {
            reference,
            guildConfigId: input.guildConfigId,
            clientName: input.clientName,
            description: input.description,
            targetQuantity: input.targetQuantity,
            negotiatedPrice: input.negotiatedPrice,
            deadline: input.deadline,
            createdByDiscordId: input.createdByDiscordId,
            partnerId: input.partnerId ?? null,
          },
        });
        await writeAudit(tx, {
          guildConfigId: input.guildConfigId,
          action: 'ORDER_CREATED',
          authorDiscordId: input.createdByDiscordId,
          entityType: 'ClientOrder',
          entityId: order.id,
          after: {
            reference,
            clientName: input.clientName,
            targetQuantity: input.targetQuantity,
            negotiatedPrice: input.negotiatedPrice,
          },
        });
        return done({ id: order.id, reference });
      });
    } catch (err) {
      // Collision de reference (creation concurrente) : on reessaie.
      if (err instanceof Error && err.message.includes('Unique constraint')) continue;
      throw err;
    }
  }
  return fail('Allocation de reference impossible apres plusieurs tentatives.');
}

export interface RecordContributionInput {
  orderId: string;
  guildConfigId: string;
  employeeId: string;
  quantity: number;
  gradeLabel: string | null;
  gradeRoleId: string | null;
  salaryRate: number | null;
  attachments: StoredAttachment[];
  riskLevel: SaleRisk;
  riskReasons: string | null;
  recordedByDiscordId: string;
}

/** Enregistre une contribution de production a une commande ouverte. */
export async function recordContribution(
  input: RecordContributionInput,
): Promise<ActionResult<{ contributionId: string; reference: string }>> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.clientOrder.findUnique({ where: { id: input.orderId } });
    if (!order || order.guildConfigId !== input.guildConfigId) return fail('Commande introuvable.');
    if (order.status !== ClientOrderStatus.OUVERTE) {
      return fail('Seule une commande ouverte accepte des contributions.');
    }

    const contribution = await tx.orderContribution.create({
      data: {
        orderId: order.id,
        guildConfigId: input.guildConfigId,
        employeeId: input.employeeId,
        quantity: input.quantity,
        gradeSnapshot: input.gradeLabel,
        gradeRoleIdSnapshot: input.gradeRoleId,
        salaryRateSnapshot: input.salaryRate,
        riskLevel: input.riskLevel,
        riskReasons: input.riskReasons,
        recordedByDiscordId: input.recordedByDiscordId,
      },
    });
    if (input.attachments.length > 0) {
      await tx.orderContributionAttachment.createMany({
        data: input.attachments.map((a) => ({ contributionId: contribution.id, ...a })),
      });
    }
    await writeAudit(tx, {
      guildConfigId: input.guildConfigId,
      action: 'ORDER_CONTRIBUTION_RECORDED',
      authorDiscordId: input.recordedByDiscordId,
      entityType: 'OrderContribution',
      entityId: contribution.id,
      after: { orderReference: order.reference, quantity: input.quantity },
    });
    return done({ contributionId: contribution.id, reference: order.reference });
  });
}

/** Marque une commande comme livree au client (en attente de paiement). */
export async function deliverOrder(
  orderId: string,
  actorId: string,
): Promise<ActionResult<{ reference: string }>> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.clientOrder.findUnique({ where: { id: orderId } });
    if (!order) return fail('Commande introuvable.');
    if (order.status !== ClientOrderStatus.OUVERTE) {
      return fail(`Action impossible depuis le statut ${order.status}.`);
    }
    const upd = await tx.clientOrder.updateMany({
      where: { id: orderId, status: ClientOrderStatus.OUVERTE },
      data: {
        status: ClientOrderStatus.LIVREE,
        deliveredAt: new Date(),
        deliveredByDiscordId: actorId,
      },
    });
    if (upd.count !== 1) return fail('Conflit : la commande a change de statut.');
    await writeAudit(tx, {
      guildConfigId: order.guildConfigId,
      action: 'ORDER_DELIVERED',
      authorDiscordId: actorId,
      entityType: 'ClientOrder',
      entityId: order.id,
    });
    return done({ reference: order.reference });
  });
}

export interface PayOrderInput {
  orderId: string;
  actorId: string;
  weekId: string;
  paymentProofKey: string | null;
}

/**
 * Encaissement d'une commande : la rattache a la semaine ouverte, ecrit le CA et
 * les salaires de production au journal, et passe au statut PAYEE. C'est ce qui
 * integre la commande a la comptabilite hebdomadaire (revenu + production).
 */
export async function payOrder(
  input: PayOrderInput,
): Promise<ActionResult<{ reference: string; total: number }>> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.clientOrder.findUnique({
      where: { id: input.orderId },
      include: {
        contributions: { where: { status: OrderContributionStatus.ACTIVE } },
      },
    });
    if (!order) return fail('Commande introuvable.');
    if (order.status === ClientOrderStatus.PAYEE) return fail('Commande deja payee.');
    if (order.status === ClientOrderStatus.ANNULEE) return fail('Commande annulee.');

    const upd = await tx.clientOrder.updateMany({
      where: { id: input.orderId, status: order.status },
      data: {
        status: ClientOrderStatus.PAYEE,
        weekId: input.weekId,
        paidAt: new Date(),
        paymentCollectedByDiscordId: input.actorId,
        paymentProofKey: input.paymentProofKey,
      },
    });
    if (upd.count !== 1) return fail('Conflit : la commande a change de statut.');

    // Journal financier : CA de la commande + salaires de production (§6.3).
    await tx.ledgerEntry.create({
      data: {
        guildConfigId: order.guildConfigId,
        type: LedgerEntryType.SALE_REVENUE,
        amount: order.negotiatedPrice,
        weekId: input.weekId,
        description: `CA commande ${order.reference} (${order.clientName})`,
      },
    });
    for (const c of order.contributions) {
      const salary = c.quantity * (c.salaryRateSnapshot ?? 0);
      if (salary > 0) {
        await tx.ledgerEntry.create({
          data: {
            guildConfigId: order.guildConfigId,
            type: LedgerEntryType.SALARY_LIABILITY,
            amount: salary,
            weekId: input.weekId,
            employeeId: c.employeeId,
            description: `Salaire commande ${order.reference}`,
          },
        });
      }
    }

    await writeAudit(tx, {
      guildConfigId: order.guildConfigId,
      action: 'ORDER_PAID',
      authorDiscordId: input.actorId,
      entityType: 'ClientOrder',
      entityId: order.id,
      after: { reference: order.reference, revenue: order.negotiatedPrice, weekId: input.weekId },
    });
    return done({ reference: order.reference, total: order.negotiatedPrice });
  });
}

/** Annule une commande (sauf si deja payee). */
export async function cancelOrder(
  orderId: string,
  actorId: string,
  reason: string,
): Promise<ActionResult<{ reference: string }>> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.clientOrder.findUnique({ where: { id: orderId } });
    if (!order) return fail('Commande introuvable.');
    if (order.status === ClientOrderStatus.PAYEE) {
      return fail('Une commande payee ne peut pas etre annulee.');
    }
    if (order.status === ClientOrderStatus.ANNULEE) return fail('Commande deja annulee.');
    await tx.clientOrder.update({
      where: { id: orderId },
      data: { status: ClientOrderStatus.ANNULEE },
    });
    await writeAudit(tx, {
      guildConfigId: order.guildConfigId,
      action: 'ORDER_CANCELLED',
      authorDiscordId: actorId,
      entityType: 'ClientOrder',
      entityId: order.id,
      reason,
    });
    return done({ reference: order.reference });
  });
}

export interface OrderSummary {
  id: string;
  reference: string;
  clientName: string;
  targetQuantity: number;
  producedQuantity: number;
  negotiatedPrice: number;
  deadline: Date | null;
  status: ClientOrderStatus;
  contributors: { nomRP: string; quantity: number }[];
}

/** Commande + progression de production (somme des contributions actives). */
export async function getOrderByReference(
  guildConfigId: string,
  reference: string,
): Promise<OrderSummary | null> {
  const order = await prisma.clientOrder.findFirst({
    where: { guildConfigId, reference },
    include: {
      contributions: {
        where: { status: OrderContributionStatus.ACTIVE },
        include: { employee: { select: { nomRP: true } } },
      },
    },
  });
  if (!order) return null;
  return toSummary(order);
}

/** Commandes en cours (ouvertes ou livrees, non payees) pour le tableau. */
export async function listActiveOrders(guildConfigId: string): Promise<OrderSummary[]> {
  const orders = await prisma.clientOrder.findMany({
    where: {
      guildConfigId,
      status: { in: [ClientOrderStatus.OUVERTE, ClientOrderStatus.LIVREE] },
    },
    orderBy: [{ deadline: 'asc' }, { createdAt: 'asc' }],
    include: {
      contributions: {
        where: { status: OrderContributionStatus.ACTIVE },
        include: { employee: { select: { nomRP: true } } },
      },
    },
  });
  return orders.map(toSummary);
}

type OrderWithContribs = {
  id: string;
  reference: string;
  clientName: string;
  targetQuantity: number;
  negotiatedPrice: number;
  deadline: Date | null;
  status: ClientOrderStatus;
  contributions: { quantity: number; employee: { nomRP: string } }[];
};

function toSummary(order: OrderWithContribs): OrderSummary {
  const byEmployee = new Map<string, number>();
  let produced = 0;
  for (const c of order.contributions) {
    produced += c.quantity;
    byEmployee.set(c.employee.nomRP, (byEmployee.get(c.employee.nomRP) ?? 0) + c.quantity);
  }
  return {
    id: order.id,
    reference: order.reference,
    clientName: order.clientName,
    targetQuantity: order.targetQuantity,
    producedQuantity: produced,
    negotiatedPrice: order.negotiatedPrice,
    deadline: order.deadline,
    status: order.status,
    contributors: [...byEmployee.entries()]
      .map(([nomRP, quantity]) => ({ nomRP, quantity }))
      .sort((a, b) => b.quantity - a.quantity),
  };
}
