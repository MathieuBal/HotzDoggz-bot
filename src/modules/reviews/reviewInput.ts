/**
 * Helpers purs pour les avis clients (sans I/O) : validation de la note et rendu
 * des etoiles. Testables et importables sans tirer la connexion base.
 */

/** Convertit une saisie libre en note entiere 1-5, ou null si invalide. */
export function parseRating(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 5 ? r : null;
}

/** Rendu en etoiles pleines/vides (ex. 4 → ⭐⭐⭐⭐☆). */
export function stars(rating: number): string {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return '⭐'.repeat(r) + '☆'.repeat(5 - r);
}

/** Note moyenne formatee a une decimale, virgule francaise. */
export function formatAverage(average: number): string {
  return average.toFixed(1).replace('.', ',');
}
