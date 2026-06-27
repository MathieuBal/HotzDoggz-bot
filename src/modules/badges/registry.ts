/**
 * Registre des badges (gamification). Les definitions vivent dans le code : la
 * table EmployeeBadge ne stocke que les badges obtenus. Premiere famille : des
 * paliers de production cumulee (ventes PNJ validees), calques sur des donnees
 * deja suivies — aucun nouveau tracking necessaire.
 */

export interface BadgeDef {
  key: string;
  label: string;
  emoji: string;
  /** Seuil d'unites cumulees validees pour debloquer (famille "production"). */
  threshold: number;
}

/** Paliers de production, du plus accessible au plus prestigieux. */
export const UNIT_BADGES: readonly BadgeDef[] = [
  { key: 'first_sale', label: 'Première vente', emoji: '🌭', threshold: 1 },
  { key: 'units_100', label: 'Centurion', emoji: '🥉', threshold: 100 },
  { key: 'units_500', label: 'Vendeur confirmé', emoji: '🥈', threshold: 500 },
  { key: 'units_1000', label: 'Maître du grill', emoji: '🥇', threshold: 1000 },
  { key: 'units_5000', label: 'Légende HotzDoggz', emoji: '👑', threshold: 5000 },
];

const BY_KEY = new Map(UNIT_BADGES.map((b) => [b.key, b]));

/** Definition d'un badge par sa cle (undefined si cle inconnue/obsolete). */
export function badgeByKey(key: string): BadgeDef | undefined {
  return BY_KEY.get(key);
}

/** Tous les badges de production atteints pour un cumul d'unites (pur, testable). */
export function unitBadgesReached(units: number): BadgeDef[] {
  return UNIT_BADGES.filter((b) => units >= b.threshold);
}

/** Rendu court d'un badge : « 🥇 Maître du grill ». */
export function formatBadge(def: BadgeDef): string {
  return `${def.emoji} ${def.label}`;
}
