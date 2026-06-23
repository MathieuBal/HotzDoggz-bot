import { type AccountingWeek, LedgerEntryType, type Payroll, SaleStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../audit/auditService.js';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface PayrollLine extends Payroll {
  employee: { nomRP: string; discordUserId: string };
}

/** Paies de la derniere semaine cloturee (CDC §6.7). */
export async function getLatestClosedPayrolls(
  guildConfigId: string,
): Promise<{ week: AccountingWeek; payrolls: PayrollLine[] } | null> {
  const week = await prisma.accountingWeek.findFirst({
    where: { guildConfigId, status: 'CLOSED' },
    orderBy: { endAt: 'desc' },
  });
  if (!week) return null;
  const payrolls = await prisma.payroll.findMany({
    where: { weekId: week.id },
    include: { employee: { select: { nomRP: true, discordUserId: true } } },
    orderBy: { totalAmount: 'desc' },
  });
  return { week, payrolls };
}

export interface PaidResult {
  nomRP: string;
  totalAmount: number;
  weekId: string;
}

/**
 * Marque la paie en attente d'un employe comme payee (CDC §6.7).
 * Verrou : impossible de payer deux fois sans correction explicite. Verrouille
 * la fiche, enregistre payeur + date, ecrit le paiement et passe les ventes
 * liees au statut PAYEE — dans une transaction.
 */
export async function markPayrollPaid(
  guildConfigId: string,
  employeeId: string,
  payerId: string,
  correlationId: string,
): Promise<ActionResult<PaidResult>> {
  return prisma.$transaction(async (tx) => {
    const payroll = await tx.payroll.findFirst({
      where: { guildConfigId, employeeId, status: 'PENDING' },
      orderBy: { week: { endAt: 'desc' } },
      include: { employee: { select: { nomRP: true } } },
    });
    if (!payroll) {
      return { ok: false, reason: 'Aucune paie en attente pour cet employe.' };
    }

    const upd = await tx.payroll.updateMany({
      where: { id: payroll.id, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date(), payerDiscordId: payerId },
    });
    if (upd.count !== 1) {
      return { ok: false, reason: 'Paie deja reglee (aucune double paie sans correction).' };
    }

    // On ne verse que le solde : le total moins les acomptes deja donnes
    // (ceux-ci ont deja leur propre sortie au journal).
    const netToPay = Math.max(0, payroll.totalAmount - payroll.advancedAmount);
    await tx.ledgerEntry.create({
      data: {
        guildConfigId,
        type: LedgerEntryType.PAYMENT,
        amount: netToPay,
        weekId: payroll.weekId,
        employeeId,
        payrollId: payroll.id,
        description:
          payroll.advancedAmount > 0
            ? `Solde ${payroll.employee.nomRP} (acompte ${payroll.advancedAmount} $ déduit)`
            : `Paiement ${payroll.employee.nomRP}`,
        correlationId,
      },
    });

    await tx.sale.updateMany({
      where: { weekId: payroll.weekId, employeeId, status: SaleStatus.INTEGREE_A_LA_PAIE },
      data: { status: SaleStatus.PAYEE },
    });

    await writeAudit(tx, {
      guildConfigId,
      action: 'PAYROLL_PAID',
      authorDiscordId: payerId,
      entityType: 'Payroll',
      entityId: payroll.id,
      after: { totalAmount: payroll.totalAmount },
      correlationId,
    });

    return {
      ok: true,
      data: {
        nomRP: payroll.employee.nomRP,
        totalAmount: netToPay,
        weekId: payroll.weekId,
      },
    };
  });
}
