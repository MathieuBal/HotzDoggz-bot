/**
 * References de vente main en main : VD-AAAA-NNNN (sequence par annee, espace de
 * noms distinct des ventes PNJ et des commandes).
 */

export const DIRECT_SALE_REFERENCE_PREFIX = 'VD';

export function formatDirectSaleReference(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000) throw new Error(`Annee invalide : ${year}`);
  if (!Number.isInteger(sequence) || sequence < 1)
    throw new Error(`Sequence invalide : ${sequence}`);
  return `${DIRECT_SALE_REFERENCE_PREFIX}-${year}-${String(sequence).padStart(4, '0')}`;
}

const REFERENCE_RE = /^VD-(\d{4})-(\d{4,})$/;

export function parseDirectSaleReference(
  reference: string,
): { year: number; sequence: number } | null {
  const m = REFERENCE_RE.exec(reference.trim());
  if (!m) return null;
  return { year: Number(m[1]), sequence: Number(m[2]) };
}

export interface DirectSaleLineAmount {
  unitPrice: number;
  quantity: number;
}

export interface DirectSaleTotals {
  totalQuantity: number;
  revenue: number;
}

/** Totaux d'une vente : quantite totale et CA (somme prix * quantite). Pur. */
export function computeDirectSaleTotals(lines: readonly DirectSaleLineAmount[]): DirectSaleTotals {
  let totalQuantity = 0;
  let revenue = 0;
  for (const l of lines) {
    totalQuantity += l.quantity;
    revenue += l.unitPrice * l.quantity;
  }
  return { totalQuantity, revenue };
}
