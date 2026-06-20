import { LedgerEntryType, type Prisma, type SaleRisk, SaleStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../audit/auditService.js';
import { canTransition } from '../sales/stateMachine.js';
import type { StoredAttachment } from '../sales/attachments.js';
import { allocateDirectSaleReference } from './directSaleReferenceService.js';
import { computeDirectSaleTotals } from './directSaleReference.js';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };
const fail = (reason: string): ActionResult<never> => ({ ok: false, reason });
const done = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export interface DirectSaleLineInput {
  productId: string | null;
  productName: string;
  unitPrice: number;
  quantity: number;
}

export interface CreateDirectSaleInput {
  guildConfigId: string;
  employeeId: string;
  buyerName: string | null;
  lines: DirectSaleLineInput[];
  attachments: StoredAttachment[];
  gradeLabel: string | null;
  gradeRoleId: string | null;
  salaryRate: number | null;
  riskLevel: SaleRisk;
  riskReasons: string | null;
  declaredAt: Date;
  authorDiscordId: string;
  threadId?: string | null;
}

/** Cree une vente main en main (statut SOUMISE) + lignes + preuve. */
export async function createDirectSale(
  input: CreateDirectSaleInput,
): Promise<ActionResult<{ id: string; reference: string }>> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const reference = await allocateDirectSaleReference(
          tx,
          input.guildConfigId,
          input.declaredAt.getFullYear(),
        );
        const sale = await tx.directSale.create({
          data: {
            reference,
            guildConfigId: input.guildConfigId,
            employeeId: input.employeeId,
            buyerName: input.buyerName,
            threadId: input.threadId ?? null,
            status: SaleStatus.SOUMISE,
            gradeSnapshot: input.gradeLabel,
            gradeRoleIdSnapshot: input.gradeRoleId,
            salaryRateSnapshot: input.salaryRate,
            riskLevel: input.riskLevel,
            riskReasons: input.riskReasons,
            declaredAt: input.declaredAt,
            lines: {
              create: input.lines.map((l) => ({
                productId: l.productId,
                productName: l.productName,
                unitPrice: l.unitPrice,
                declaredQuantity: l.quantity,
              })),
            },
          },
        });
        if (input.attachments.length > 0) {
          await tx.directSaleAttachment.createMany({
            data: input.attachments.map((a) => ({ directSaleId: sale.id, ...a })),
          });
        }
        await writeAudit(tx, {
          guildConfigId: input.guildConfigId,
          action: 'DIRECT_SALE_CREATED',
          authorDiscordId: input.authorDiscordId,
          entityType: 'DirectSale',
          entityId: sale.id,
          after: { reference, lines: input.lines.length },
        });
        return done({ id: sale.id, reference });
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('Unique constraint')) {
        // collision de reference -> on reessaie ; collision de threadId -> deja traite
        if (err.message.includes('threadId')) return fail('Vente deja enregistree.');
        continue;
      }
      throw err;
    }
  }
  return fail('Allocation de reference impossible apres plusieurs tentatives.');
}

interface DirectRef {
  saleId: string;
  reference: string;
  threadId: string | null;
  controlThreadId: string | null;
  employeeDiscordId: string;
  casierForumId: string | null;
}

/** Prise en charge : SOUMISE/INCOMPLETE -> EN_VERIFICATION. */
export async function takeChargeDirectSale(
  saleId: string,
  actorId: string,
): Promise<ActionResult<DirectRef>> {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.directSale.findUnique({ where: { id: saleId } });
    if (!sale) return fail('Vente introuvable.');
    if (sale.status === SaleStatus.EN_VERIFICATION && sale.controllerDiscordId) {
      return done(await refOf(tx, saleId));
    }
    if (!canTransition(sale.status, SaleStatus.EN_VERIFICATION)) {
      return fail(`Action impossible depuis le statut ${sale.status}.`);
    }
    const upd = await tx.directSale.updateMany({
      where: { id: saleId, status: sale.status },
      data: { status: SaleStatus.EN_VERIFICATION, controllerDiscordId: actorId },
    });
    if (upd.count !== 1) return fail('Conflit : le dossier a change de statut.');
    await writeAudit(tx, {
      guildConfigId: sale.guildConfigId,
      action: 'DIRECT_SALE_TAKEN_CHARGE',
      authorDiscordId: actorId,
      entityType: 'DirectSale',
      entityId: saleId,
    });
    return done(await refOf(tx, saleId));
  });
}

async function refOf(tx: Prisma.TransactionClient, saleId: string): Promise<DirectRef> {
  const sale = await tx.directSale.findUniqueOrThrow({
    where: { id: saleId },
    include: { employee: { select: { discordUserId: true, casierForumId: true } } },
  });
  return {
    saleId: sale.id,
    reference: sale.reference,
    threadId: sale.threadId,
    controlThreadId: sale.controlThreadId,
    employeeDiscordId: sale.employee.discordUserId,
    casierForumId: sale.employee.casierForumId,
  };
}

export interface ValidateDirectSaleInput {
  saleId: string;
  actorId: string;
  /** Quantites validees par ligne (defaut : quantite declaree). */
  lineQuantities: { lineId: string; validatedQuantity: number }[];
  note: string;
  correlationId: string;
}

export interface ValidatedDirectSale extends DirectRef {
  revenue: number;
  salaryAmount: number;
  totalQuantity: number;
}

/** Validation : fige les quantites par ligne, ecrit CA + salaire, rattache la semaine. */
export async function validateDirectSale(
  input: ValidateDirectSaleInput,
): Promise<ActionResult<ValidatedDirectSale>> {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.directSale.findUnique({
      where: { id: input.saleId },
      include: { lines: true },
    });
    if (!sale) return fail('Vente introuvable.');
    if (!canTransition(sale.status, SaleStatus.VALIDEE)) {
      return fail(`Action impossible depuis le statut ${sale.status}.`);
    }
    const week = await tx.accountingWeek.findFirst({
      where: { guildConfigId: sale.guildConfigId, status: 'OPEN' },
    });
    if (!week) return fail('Aucune semaine ouverte : impossible de valider.');

    const overrides = new Map(input.lineQuantities.map((q) => [q.lineId, q.validatedQuantity]));
    const validatedLines = sale.lines.map((l) => ({
      id: l.id,
      unitPrice: l.unitPrice,
      quantity: overrides.get(l.id) ?? l.declaredQuantity,
    }));
    const { totalQuantity, revenue } = computeDirectSaleTotals(validatedLines);
    const salaryAmount = totalQuantity * (sale.salaryRateSnapshot ?? 0);

    const upd = await tx.directSale.updateMany({
      where: { id: input.saleId, status: sale.status },
      data: {
        status: SaleStatus.VALIDEE,
        weekId: week.id,
        validatedByDiscordId: input.actorId,
        validatedAt: new Date(),
        verificationNote: input.note,
      },
    });
    if (upd.count !== 1) return fail('Conflit : le dossier a change de statut.');

    for (const l of validatedLines) {
      await tx.directSaleLine.update({
        where: { id: l.id },
        data: { validatedQuantity: l.quantity },
      });
    }

    await tx.ledgerEntry.createMany({
      data: [
        {
          guildConfigId: sale.guildConfigId,
          type: LedgerEntryType.SALE_REVENUE,
          amount: revenue,
          weekId: week.id,
          description: `CA vente directe ${sale.reference}`,
          correlationId: input.correlationId,
        },
        {
          guildConfigId: sale.guildConfigId,
          type: LedgerEntryType.SALARY_LIABILITY,
          amount: salaryAmount,
          weekId: week.id,
          employeeId: sale.employeeId,
          description: `Salaire vente directe ${sale.reference}`,
          correlationId: input.correlationId,
        },
      ],
    });
    await writeAudit(tx, {
      guildConfigId: sale.guildConfigId,
      action: 'DIRECT_SALE_VALIDATED',
      authorDiscordId: input.actorId,
      entityType: 'DirectSale',
      entityId: input.saleId,
      after: { totalQuantity, revenue, salaryAmount },
      reason: input.note,
      correlationId: input.correlationId,
    });

    return done({ ...(await refOf(tx, input.saleId)), revenue, salaryAmount, totalQuantity });
  });
}

/** Refus : -> REFUSEE, motif obligatoire, aucun effet financier. */
export async function refuseDirectSale(
  saleId: string,
  actorId: string,
  reason: string,
  correlationId: string,
): Promise<ActionResult<DirectRef>> {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.directSale.findUnique({ where: { id: saleId } });
    if (!sale) return fail('Vente introuvable.');
    if (!canTransition(sale.status, SaleStatus.REFUSEE)) {
      return fail(`Action impossible depuis le statut ${sale.status}.`);
    }
    const upd = await tx.directSale.updateMany({
      where: { id: saleId, status: sale.status },
      data: { status: SaleStatus.REFUSEE, refusalReason: reason },
    });
    if (upd.count !== 1) return fail('Conflit : le dossier a change de statut.');
    await writeAudit(tx, {
      guildConfigId: sale.guildConfigId,
      action: 'DIRECT_SALE_REFUSED',
      authorDiscordId: actorId,
      entityType: 'DirectSale',
      entityId: saleId,
      reason,
      correlationId,
    });
    return done(await refOf(tx, saleId));
  });
}

/** Vente main en main avec ses lignes (pour la commande et la fiche). */
export function getDirectSaleByReference(guildConfigId: string, reference: string) {
  return prisma.directSale.findFirst({
    where: { guildConfigId, reference },
    include: { lines: true, employee: { select: { nomRP: true } } },
  });
}

export function getDirectSaleById(saleId: string) {
  return prisma.directSale.findUnique({
    where: { id: saleId },
    include: { lines: true, employee: { select: { nomRP: true } } },
  });
}
