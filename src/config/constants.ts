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

/**
 * Plafond des montants/quantites saisis dans les modales (prix, salaires,
 * objectifs, volumes). Genereux pour l'economie GTA RP, mais borne les saisies
 * aberrantes (fautes de frappe a 10^12) qui pollueraient calculs et affichage.
 */
export const MAX_AMOUNT = 1_000_000_000;

/** Vrai si `n` est un entier dans [min, MAX_AMOUNT]. Defensif contre NaN. */
export function isAmountInRange(n: number, min = 1): boolean {
  return Number.isInteger(n) && n >= min && n <= MAX_AMOUNT;
}

/**
 * Interrupteur du module garage / gestion des stocks (vehicules, saucisses,
 * lots de hot dogs). Mis de cote pour le moment (peu utile au lancement) :
 * a `false`, les commandes `/stock` et `/vehicule` ne sont pas enregistrees et
 * les tableaux stock/garage ne sont plus publies. Le code et les donnees en base
 * restent intacts — repasser a `true` reactive tout, sans migration.
 */
export const GARAGE_STOCK_ENABLED = false;

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

/**
 * Palette semantique des embeds (handoff design HotzDoggz §01/02). Chaque
 * couleur porte un sens, pas une humeur : on choisit selon le ROLE du tableau,
 * jamais au hasard.
 *  - production : tableaux tournes vers les employes (activite, perso, entreprise)
 *  - direction  : tableaux comptables/pilotage (compta, commandes, cloture)
 *  - prime      : tout ce qui touche a la cagnotte/recompense
 *  - paie       : versements, grille salariale (tout est OK, rien ne bloque)
 *  - alerte     : il reste quelque chose a faire (a verser, force…)
 *  - neutre     : etats vides / informatifs sans enjeu
 */
export const EMBED_COLORS = {
  production: 0xf26419,
  direction: 0x3e78b2,
  prime: 0xe2a03f,
  paie: 0x3fa66a,
  alerte: 0xd64545,
  neutre: 0x7e8794,
} as const;
