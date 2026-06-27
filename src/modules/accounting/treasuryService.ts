import { LedgerEntryType } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';

/**
 * Recap de tresorerie cumule (depuis le debut), lu depuis le journal financier
 * signe. On NE fabrique PAS un solde de caisse unique potentiellement faux : un
 * retrait de dividende direction en jeu n'est pas trace comme decaissement. On
 * expose donc un detail honnete par categorie + un flux de caisse strictement
 * defini (encaisse - verse aux employes).
 */

export interface LedgerTotals {
  revenue: number; // SALE_REVENUE — CA encaisse
  adjustments: number; // ADJUSTMENT — corrections signees
  payments: number; // PAYMENT — verse aux employes (salaires + acomptes)
  salaryLiability: number; // SALARY_LIABILITY — salaires dus (accrual)
  reserve: number; // RESERVE_ALLOCATION — reserve allouee (cumul)
  bonus: number; // BONUS_ALLOCATION — prime allouee (cumul)
  direction: number; // DIRECTION_ALLOCATION — parts direction (cumul)
}

export interface TreasuryView extends LedgerTotals {
  /** Flux de caisse net, strictement defini : encaisse (CA + ajustements) - verse. */
  cashFlow: number;
}

/** Agrege une map type -> somme en vue de tresorerie (fonction pure, testable). */
export function summarizeLedger(sums: Partial<Record<LedgerEntryType, number>>): TreasuryView {
  const get = (t: LedgerEntryType): number => sums[t] ?? 0;
  const totals: LedgerTotals = {
    revenue: get(LedgerEntryType.SALE_REVENUE),
    adjustments: get(LedgerEntryType.ADJUSTMENT),
    payments: get(LedgerEntryType.PAYMENT),
    salaryLiability: get(LedgerEntryType.SALARY_LIABILITY),
    reserve: get(LedgerEntryType.RESERVE_ALLOCATION),
    bonus: get(LedgerEntryType.BONUS_ALLOCATION),
    direction: get(LedgerEntryType.DIRECTION_ALLOCATION),
  };
  return {
    ...totals,
    cashFlow: totals.revenue + totals.adjustments - totals.payments,
  };
}

/** Recap de tresorerie d'un serveur (cumul de tout le journal). */
export async function getTreasury(guildConfigId: string): Promise<TreasuryView> {
  const rows = await prisma.ledgerEntry.groupBy({
    by: ['type'],
    where: { guildConfigId },
    _sum: { amount: true },
  });
  const sums: Partial<Record<LedgerEntryType, number>> = {};
  for (const r of rows) sums[r.type] = r._sum.amount ?? 0;
  return summarizeLedger(sums);
}
