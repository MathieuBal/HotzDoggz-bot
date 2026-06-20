/**
 * References de commande client : format CMD-AAAA-NNNN (sequence par annee,
 * 4 chiffres min). Meme logique que les ventes (HD-...), espace de noms distinct.
 */

export const ORDER_REFERENCE_PREFIX = 'CMD';

export function formatOrderReference(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000) {
    throw new Error(`Annee invalide : ${year}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Sequence invalide : ${sequence}`);
  }
  return `${ORDER_REFERENCE_PREFIX}-${year}-${String(sequence).padStart(4, '0')}`;
}

const REFERENCE_RE = /^CMD-(\d{4})-(\d{4,})$/;

export function parseOrderReference(reference: string): { year: number; sequence: number } | null {
  const m = REFERENCE_RE.exec(reference.trim());
  if (!m) return null;
  return { year: Number(m[1]), sequence: Number(m[2]) };
}
