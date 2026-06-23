/**
 * Duree de vie d'un hot dog cuit (perissable) : 6 jours et 17 heures.
 * Pure (testable) : sert au calcul de la date de peremption.
 */
export const HOTDOG_LIFETIME_MS = (6 * 24 + 17) * 3600 * 1000;

/** Date de peremption d'un lot produit a `producedAt`. */
export function expiryOf(producedAt: Date): Date {
  return new Date(producedAt.getTime() + HOTDOG_LIFETIME_MS);
}

/** Formate un temps restant en "Jj Hh" (ou "expiré"). */
export function formatCountdown(expiresAt: Date, now: Date = new Date()): string {
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return 'expiré';
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  if (days > 0) return `${days}j ${hours}h`;
  const min = totalMin % 60;
  return `${hours}h ${min}min`;
}
