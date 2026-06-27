import { LedgerEntryType, type Prisma, SaleStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../audit/auditService.js';
import { computeRevenueAdjustment } from '../accounting/finance.js';
import { canTransition } from '../sales/stateMachine.js';

/**
 * Service de controle direction (CDC §5.4). Chaque action est une transaction
 * atomique avec verrou optimiste (updateMany guarde par le statut courant) :
 * en cas de validation simultanee, une seule reussit (§11).
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const fail = (reason: string): ActionResult<never> => ({ ok: false, reason });
const done = <T>(data: T): ActionResult<T> => ({ ok: true, data });

interface SaleRef {
  saleId: string;
  reference: string;
  threadId: string;
  weekId: string;
  employeeDiscordId: string;
  casierForumId: string | null;
}

async function loadSaleRef(
  tx: Prisma.TransactionClient,
  saleId: string,
): Promise<{ status: SaleStatus; guildConfigId: string; ref: SaleRef } | null> {
  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    include: { employee: { select: { discordUserId: true, casierForumId: true } } },
  });
  if (!sale) return null;
  return {
    status: sale.status,
    guildConfigId: sale.guildConfigId,
    ref: {
      saleId: sale.id,
      reference: sale.reference,
      threadId: sale.threadId,
      weekId: sale.weekId,
      employeeDiscordId: sale.employee.discordUserId,
      casierForumId: sale.employee.casierForumId,
    },
  };
}

/** Prise en charge : SOUMISE/INCOMPLETE -> EN_VERIFICATION, assigne le controleur. */
export async function takeCharge(
  saleId: string,
  actorId: string,
  correlationId: string,
): Promise<ActionResult<SaleRef & { alreadyControlledBy?: string }>> {
  return prisma.$transaction(async (tx) => {
    const loaded = await loadSaleRef(tx, saleId);
    if (!loaded) return fail('Vente introuvable.');

    const current = await tx.sale.findUnique({
      where: { id: saleId },
      select: { controllerDiscordId: true },
    });
    if (loaded.status === SaleStatus.EN_VERIFICATION && current?.controllerDiscordId) {
      return done({ ...loaded.ref, alreadyControlledBy: current.controllerDiscordId });
    }
    if (!canTransition(loaded.status, SaleStatus.EN_VERIFICATION)) {
      return fail(`Action impossible depuis le statut ${loaded.status}.`);
    }

    const upd = await tx.sale.updateMany({
      where: { id: saleId, status: loaded.status },
      data: { status: SaleStatus.EN_VERIFICATION, controllerDiscordId: actorId },
    });
    if (upd.count !== 1) return fail('Conflit : le dossier a change de statut.');

    await tx.saleStatusHistory.create({
      data: {
        saleId,
        fromStatus: loaded.status,
        toStatus: SaleStatus.EN_VERIFICATION,
        authorDiscordId: actorId,
        correlationId,
      },
    });
    await writeAudit(tx, {
      guildConfigId: loaded.guildConfigId,
      action: 'SALE_TAKEN_CHARGE',
      authorDiscordId: actorId,
      entityType: 'Sale',
      entityId: saleId,
      correlationId,
    });
    return done(loaded.ref);
  });
}

/** Demande de complement : -> INCOMPLETE, motif obligatoire, aucun effet financier. */
export async function requestComplement(
  saleId: string,
  actorId: string,
  reason: string,
  correlationId: string,
): Promise<ActionResult<SaleRef>> {
  return prisma.$transaction(async (tx) => {
    const loaded = await loadSaleRef(tx, saleId);
    if (!loaded) return fail('Vente introuvable.');
    if (!canTransition(loaded.status, SaleStatus.INCOMPLETE)) {
      return fail(`Action impossible depuis le statut ${loaded.status}.`);
    }
    const upd = await tx.sale.updateMany({
      where: { id: saleId, status: loaded.status },
      data: { status: SaleStatus.INCOMPLETE },
    });
    if (upd.count !== 1) return fail('Conflit : le dossier a change de statut.');

    await tx.saleStatusHistory.create({
      data: {
        saleId,
        fromStatus: loaded.status,
        toStatus: SaleStatus.INCOMPLETE,
        authorDiscordId: actorId,
        reason,
        correlationId,
      },
    });
    await writeAudit(tx, {
      guildConfigId: loaded.guildConfigId,
      action: 'SALE_COMPLEMENT_REQUESTED',
      authorDiscordId: actorId,
      entityType: 'Sale',
      entityId: saleId,
      reason,
      correlationId,
    });
    return done(loaded.ref);
  });
}

/** Refus : -> REFUSEE, motif obligatoire, aucun effet financier, dossier conserve. */
export async function refuseSale(
  saleId: string,
  actorId: string,
  reason: string,
  correlationId: string,
): Promise<ActionResult<SaleRef>> {
  return prisma.$transaction(async (tx) => {
    const loaded = await loadSaleRef(tx, saleId);
    if (!loaded) return fail('Vente introuvable.');
    if (!canTransition(loaded.status, SaleStatus.REFUSEE)) {
      return fail(`Action impossible depuis le statut ${loaded.status}.`);
    }
    const upd = await tx.sale.updateMany({
      where: { id: saleId, status: loaded.status },
      data: { status: SaleStatus.REFUSEE, refusalReason: reason },
    });
    if (upd.count !== 1) return fail('Conflit : le dossier a change de statut.');

    await tx.saleStatusHistory.create({
      data: {
        saleId,
        fromStatus: loaded.status,
        toStatus: SaleStatus.REFUSEE,
        authorDiscordId: actorId,
        reason,
        correlationId,
      },
    });
    await writeAudit(tx, {
      guildConfigId: loaded.guildConfigId,
      action: 'SALE_REFUSED',
      authorDiscordId: actorId,
      entityType: 'Sale',
      entityId: saleId,
      reason,
      correlationId,
    });
    return done(loaded.ref);
  });
}

export interface ValidateInput {
  saleId: string;
  actorId: string;
  validatedQuantity: number;
  note: string;
  comment?: string | null;
  gradeLabel: string;
  gradeRoleId: string;
  salaryRate: number;
  pnjUnitPrice: number;
  correlationId: string;
}

export interface ValidatedSale extends SaleRef {
  validatedQuantity: number;
  salaryAmount: number;
  revenue: number;
}

/**
 * Validation (§5.4 / §9.4) : fige quantite validee + snapshots, calcule, ecrit
 * le journal financier (SALE_REVENUE + SALARY_LIABILITY), historise et audite —
 * le tout dans une seule transaction.
 */
export async function validateSale(input: ValidateInput): Promise<ActionResult<ValidatedSale>> {
  return prisma.$transaction(async (tx) => {
    const loaded = await loadSaleRef(tx, input.saleId);
    if (!loaded) return fail('Vente introuvable.');
    if (!canTransition(loaded.status, SaleStatus.VALIDEE)) {
      return fail(`Action impossible depuis le statut ${loaded.status}.`);
    }

    const revenue = input.validatedQuantity * input.pnjUnitPrice;
    const salaryAmount = input.validatedQuantity * input.salaryRate;

    const upd = await tx.sale.updateMany({
      where: { id: input.saleId, status: loaded.status },
      data: {
        status: SaleStatus.VALIDEE,
        validatedQuantity: input.validatedQuantity,
        validatedByDiscordId: input.actorId,
        validatedAt: new Date(),
        verificationNote: input.note,
        comment: input.comment ?? null,
        gradeSnapshot: input.gradeLabel,
        gradeRoleIdSnapshot: input.gradeRoleId,
        salaryRateSnapshot: input.salaryRate,
        pnjUnitPriceSnapshot: input.pnjUnitPrice,
      },
    });
    if (upd.count !== 1) return fail('Conflit : le dossier a change de statut.');

    await tx.ledgerEntry.createMany({
      data: [
        {
          guildConfigId: loaded.guildConfigId,
          type: LedgerEntryType.SALE_REVENUE,
          amount: revenue,
          weekId: loaded.ref.weekId,
          saleId: input.saleId,
          employeeId: undefined,
          description: `CA vente ${loaded.ref.reference}`,
          correlationId: input.correlationId,
        },
        {
          guildConfigId: loaded.guildConfigId,
          type: LedgerEntryType.SALARY_LIABILITY,
          amount: salaryAmount,
          weekId: loaded.ref.weekId,
          saleId: input.saleId,
          description: `Salaire vente ${loaded.ref.reference}`,
          correlationId: input.correlationId,
        },
      ],
    });

    await tx.saleStatusHistory.create({
      data: {
        saleId: input.saleId,
        fromStatus: loaded.status,
        toStatus: SaleStatus.VALIDEE,
        authorDiscordId: input.actorId,
        reason: input.note,
        correlationId: input.correlationId,
      },
    });
    await writeAudit(tx, {
      guildConfigId: loaded.guildConfigId,
      action: 'SALE_VALIDATED',
      authorDiscordId: input.actorId,
      entityType: 'Sale',
      entityId: input.saleId,
      after: { validatedQuantity: input.validatedQuantity, revenue, salaryAmount },
      reason: input.note,
      correlationId: input.correlationId,
    });

    return done({
      ...loaded.ref,
      validatedQuantity: input.validatedQuantity,
      salaryAmount,
      revenue,
    });
  });
}

export interface CorrectInput {
  saleId: string;
  actorId: string;
  newQuantity: number;
  reason: string;
  correlationId: string;
}

/**
 * Correction avant cloture (§5.4) : conserve ancien et nouveau montant, ecrit un
 * ajustement, historise. Le recalcul des tableaux de semaine sera branche en
 * Phase 4 (les totaux restent derives des ventes validees, §6.1).
 */
export async function correctSale(
  input: CorrectInput,
): Promise<ActionResult<SaleRef & { oldQuantity: number; newQuantity: number }>> {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: input.saleId },
      include: { employee: { select: { discordUserId: true, casierForumId: true } }, week: true },
    });
    if (!sale) return fail('Vente introuvable.');
    if (sale.status !== SaleStatus.VALIDEE) {
      return fail('Seule une vente validee peut etre corrigee.');
    }
    if (sale.week.status !== 'OPEN') {
      return fail('Semaine cloturee : utiliser la procedure d’ajustement (§5.4).');
    }
    if (sale.validatedQuantity === null || sale.salaryRateSnapshot === null) {
      return fail('Vente sans quantite validee : correction impossible.');
    }

    const oldQuantity = sale.validatedQuantity;
    const pnj = sale.pnjUnitPriceSnapshot ?? 0;
    const salaryRate = sale.salaryRateSnapshot ?? 0;
    // Ajustements SIGNES : negatifs si la quantite validee baisse. Le journal est
    // un journal signe (cf. cancelLastAdvance qui contre-passe en -amount) ;
    // sommer par type doit redonner CA et salaires reels. Un Math.abs ajouterait
    // du CA/salaire sur une baisse au lieu d'en retrancher.
    const revenueDelta = computeRevenueAdjustment(oldQuantity, input.newQuantity, pnj);
    const salaryDelta = computeRevenueAdjustment(oldQuantity, input.newQuantity, salaryRate);
    const deltaLabel = revenueDelta >= 0 ? `+${revenueDelta}` : `${revenueDelta}`;

    await tx.sale.update({
      where: { id: input.saleId },
      data: { validatedQuantity: input.newQuantity },
    });
    await tx.ledgerEntry.create({
      data: {
        guildConfigId: sale.guildConfigId,
        type: LedgerEntryType.ADJUSTMENT,
        amount: revenueDelta,
        weekId: sale.weekId,
        saleId: sale.id,
        description: `Correction CA ${sale.reference} : ${oldQuantity} -> ${input.newQuantity} (${deltaLabel} $)`,
        correlationId: input.correlationId,
      },
    });
    // Contre-passation salariale tracable : maintient la somme SALARY_LIABILITY
    // alignee sur la quantite corrigee (la paie reste derivee de validatedQuantity,
    // mais le journal doit rester juste). On n'ecrit rien si le salaire ne bouge pas.
    if (salaryDelta !== 0) {
      await tx.ledgerEntry.create({
        data: {
          guildConfigId: sale.guildConfigId,
          type: LedgerEntryType.SALARY_LIABILITY,
          amount: salaryDelta,
          weekId: sale.weekId,
          saleId: sale.id,
          description: `Correction salaire ${sale.reference} : ${oldQuantity} -> ${input.newQuantity}`,
          correlationId: input.correlationId,
        },
      });
    }
    await tx.saleStatusHistory.create({
      data: {
        saleId: sale.id,
        fromStatus: SaleStatus.VALIDEE,
        toStatus: SaleStatus.VALIDEE,
        authorDiscordId: input.actorId,
        reason: input.reason,
        correlationId: input.correlationId,
      },
    });
    await writeAudit(tx, {
      guildConfigId: sale.guildConfigId,
      action: 'SALE_CORRECTED',
      authorDiscordId: input.actorId,
      entityType: 'Sale',
      entityId: sale.id,
      before: { validatedQuantity: oldQuantity },
      after: { validatedQuantity: input.newQuantity },
      reason: input.reason,
      correlationId: input.correlationId,
    });

    return done({
      saleId: sale.id,
      reference: sale.reference,
      threadId: sale.threadId,
      weekId: sale.weekId,
      employeeDiscordId: sale.employee.discordUserId,
      casierForumId: sale.employee.casierForumId,
      oldQuantity,
      newQuantity: input.newQuantity,
    });
  });
}
