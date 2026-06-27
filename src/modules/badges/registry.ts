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

/**
 * Paliers de production (ventes PNJ validees, unites cumulees). Echelle pensee
 * pour des farmeurs : il y a TOUJOURS un palier au-dessus, jusqu'au prestige.
 */
export const UNIT_BADGES: readonly BadgeDef[] = [
  { key: 'first_sale', label: 'Première vente', emoji: '🌭', threshold: 1 },
  { key: 'units_100', label: 'Centurion', emoji: '🥉', threshold: 100 },
  { key: 'units_500', label: 'Vendeur confirmé', emoji: '🥈', threshold: 500 },
  { key: 'units_1000', label: 'Maître du grill', emoji: '🥇', threshold: 1_000 },
  { key: 'units_5000', label: 'Légende HotzDoggz', emoji: '👑', threshold: 5_000 },
  { key: 'units_10000', label: 'Machine à hot-dogs', emoji: '🔥', threshold: 10_000 },
  { key: 'units_25000', label: 'Cadence infernale', emoji: '⚡', threshold: 25_000 },
  { key: 'units_50000', label: 'Idole du grill', emoji: '🌟', threshold: 50_000 },
  { key: 'units_100000', label: 'G.O.A.T. du hot-dog', emoji: '🐐', threshold: 100_000 },
];

/** Paliers de CA cumule genere (ventes PNJ validees), en dollars. */
export const REVENUE_BADGES: readonly BadgeDef[] = [
  { key: 'rev_100k', label: 'Caissier', emoji: '💵', threshold: 100_000 },
  { key: 'rev_500k', label: 'Gros bras du grill', emoji: '💰', threshold: 500_000 },
  { key: 'rev_1m', label: 'Millionnaire', emoji: '🤑', threshold: 1_000_000 },
  { key: 'rev_5m', label: 'Magnat du hot-dog', emoji: '🏦', threshold: 5_000_000 },
  { key: 'rev_10m', label: 'Empire HotzDoggz', emoji: '🏙️', threshold: 10_000_000 },
];

/** Paliers de contribution aux commandes clients (nombre de contributions). */
export const CONTRIBUTION_BADGES: readonly BadgeDef[] = [
  { key: 'contrib_10', label: 'Petite main', emoji: '🤝', threshold: 10 },
  { key: 'contrib_50', label: 'Pilier de production', emoji: '🛠️', threshold: 50 },
  { key: 'contrib_100', label: 'Maître d’œuvre', emoji: '🏗️', threshold: 100 },
  { key: 'contrib_250', label: 'Légende de l’atelier', emoji: '🏛️', threshold: 250 },
];

/** Seuil d'une vente unique pour le badge « grosse prise ». */
export const BIG_SALE_THRESHOLD = 250;

/** Badges speciaux (evenementiels, threshold non significatif pour l'echelle). */
export const SPECIAL_BADGES: readonly BadgeDef[] = [
  { key: 'five_star', label: 'Service 5 étoiles', emoji: '⭐', threshold: 0 },
  { key: 'big_sale', label: `Grosse prise (${BIG_SALE_THRESHOLD}+ d’un coup)`, emoji: '🐋', threshold: 0 },
];

/** Toutes les familles de badges (pour la resolution par cle et l'affichage). */
export const ALL_BADGES: readonly BadgeDef[] = [
  ...UNIT_BADGES,
  ...REVENUE_BADGES,
  ...CONTRIBUTION_BADGES,
  ...SPECIAL_BADGES,
];

const BY_KEY = new Map(ALL_BADGES.map((b) => [b.key, b]));

/** Definition d'un badge par sa cle (undefined si cle inconnue/obsolete). */
export function badgeByKey(key: string): BadgeDef | undefined {
  return BY_KEY.get(key);
}

/** Tous les badges de production atteints pour un cumul d'unites (pur, testable). */
export function unitBadgesReached(units: number): BadgeDef[] {
  return UNIT_BADGES.filter((b) => units >= b.threshold);
}

/** Tous les badges de CA atteints pour un revenu cumule (pur, testable). */
export function revenueBadgesReached(revenue: number): BadgeDef[] {
  return REVENUE_BADGES.filter((b) => revenue >= b.threshold);
}

/** Tous les badges de contribution atteints pour un nombre de contributions. */
export function contributionBadgesReached(count: number): BadgeDef[] {
  return CONTRIBUTION_BADGES.filter((b) => count >= b.threshold);
}

/** Rendu court d'un badge : « 🥇 Maître du grill ». */
export function formatBadge(def: BadgeDef): string {
  return `${def.emoji} ${def.label}`;
}
