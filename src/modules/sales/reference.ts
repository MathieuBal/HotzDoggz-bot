/**
 * Generation des references de vente (CDC §4.5 : "VENTE HD-2026-0042").
 * Format : HD-AAAA-NNNN (sequence remise a zero par annee, sur 4 chiffres min).
 */

export const SALE_REFERENCE_PREFIX = 'HD';

export function formatSaleReference(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000) {
    throw new Error(`Annee invalide : ${year}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Sequence invalide : ${sequence}`);
  }
  const seq = String(sequence).padStart(4, '0');
  return `${SALE_REFERENCE_PREFIX}-${year}-${seq}`;
}

const REFERENCE_RE = /^HD-(\d{4})-(\d{4,})$/;

export function parseSaleReference(reference: string): { year: number; sequence: number } | null {
  const m = REFERENCE_RE.exec(reference.trim());
  if (!m) return null;
  return { year: Number(m[1]), sequence: Number(m[2]) };
}
