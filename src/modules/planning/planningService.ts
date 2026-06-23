import { ClientOrderStatus, OrderContributionStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';

export interface PlanningOrder {
  id: string;
  reference: string;
  clientName: string;
  targetQuantity: number;
  producedQuantity: number;
  deadline: Date | null;
  status: ClientOrderStatus;
  open: boolean; // OUVERTE (accepte du positionnement)
  signups: string[]; // nomRP des employes positionnes
}

/** Commandes en cours (ouvertes/livrees) avec progression et positionnements. */
export async function getPlanningOrders(guildConfigId: string): Promise<PlanningOrder[]> {
  const orders = await prisma.clientOrder.findMany({
    where: {
      guildConfigId,
      status: { in: [ClientOrderStatus.OUVERTE, ClientOrderStatus.LIVREE] },
    },
    orderBy: [{ deadline: 'asc' }, { createdAt: 'asc' }],
    include: {
      contributions: {
        where: { status: OrderContributionStatus.ACTIVE },
        select: { quantity: true },
      },
      signups: { include: { employee: { select: { nomRP: true } } } },
    },
  });

  return orders.map((o) => ({
    id: o.id,
    reference: o.reference,
    clientName: o.clientName,
    targetQuantity: o.targetQuantity,
    producedQuantity: o.contributions.reduce((s, c) => s + c.quantity, 0),
    deadline: o.deadline,
    status: o.status,
    open: o.status === ClientOrderStatus.OUVERTE,
    signups: o.signups.map((s) => s.employee.nomRP),
  }));
}

export type ToggleResult =
  | { ok: true; positioned: boolean; reference: string }
  | { ok: false; reason: string };

/** Positionne / retire un employe d'une commande (toggle). */
export async function toggleSignup(
  guildConfigId: string,
  orderId: string,
  employeeId: string,
): Promise<ToggleResult> {
  const order = await prisma.clientOrder.findFirst({
    where: { id: orderId, guildConfigId },
    select: { reference: true, status: true },
  });
  if (!order) return { ok: false, reason: 'Commande introuvable.' };
  if (order.status !== ClientOrderStatus.OUVERTE) {
    return { ok: false, reason: 'Cette commande n’est plus ouverte.' };
  }

  const existing = await prisma.orderSignup.findUnique({
    where: { orderId_employeeId: { orderId, employeeId } },
  });
  if (existing) {
    await prisma.orderSignup.delete({ where: { id: existing.id } });
    return { ok: true, positioned: false, reference: order.reference };
  }
  await prisma.orderSignup.create({ data: { orderId, employeeId } });
  return { ok: true, positioned: true, reference: order.reference };
}
