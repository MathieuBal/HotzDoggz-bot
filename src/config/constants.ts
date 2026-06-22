/**
 * Constantes metier HotzDoggz (CDC §1.3 a §1.5).
 *
 * NB : ces valeurs sont les valeurs par defaut / de reference. La source de
 * verite a la validation d'une vente reste le `GradeRate` enregistre en base
 * (snapshote sur la vente). Une modification de tarif ne reecrit jamais
 * l'historique (§6.2).
 */

/** Prix de vente d'un hot dog au PNJ, verse a la caisse de l'entreprise. */
export const PNJ_UNIT_PRICE = 210;

/** Reserve de securite : 5 % du CA, jamais utilisee pour payer (§1.4). */
export const RESERVE_RATE_PERCENT = 5;

/** Repartition du benefice distribuable (§1.4). */
export const BONUS_RATE_PERCENT = 35; // prime du meilleur employe eligible
export const DIRECTOR_RATE_PERCENT = 40; // Directeur
export const CODIRECTOR_RATE_PERCENT = 25; // Co-directeur (absorbe le residu d'arrondi)

/**
 * Grades salariaux et tarif par hot dog valide.
 * DIRECTION (Directeur & Co-directeur) : 185 $/unite — decision metier validee,
 * en plus de leur part du benefice (§1.4) et hors prime du meilleur employe.
 */
export const Grade = {
  STAGIAIRE: 'STAGIAIRE',
  NOVICE: 'NOVICE',
  EXPERIMENTE: 'EXPERIMENTE',
  CHEF_EQUIPE: 'CHEF_EQUIPE',
  DIRECTION: 'DIRECTION',
} as const;

export type Grade = (typeof Grade)[keyof typeof Grade];

export const GRADE_LABELS: Record<Grade, string> = {
  STAGIAIRE: 'Stagiaire',
  NOVICE: 'Novice',
  EXPERIMENTE: 'Experimente',
  CHEF_EQUIPE: "Chef d'equipe",
  DIRECTION: 'Direction',
};

export const GRADE_RATES: Record<Grade, number> = {
  STAGIAIRE: 145,
  NOVICE: 155,
  EXPERIMENTE: 165,
  CHEF_EQUIPE: 175,
  DIRECTION: 185,
};
