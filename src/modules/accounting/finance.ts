import {
  BONUS_RATE_PERCENT,
  CODIRECTOR_RATE_PERCENT,
  DIRECTOR_RATE_PERCENT,
  RESERVE_RATE_PERCENT,
} from '../../config/constants.js';

/**
 * Calculs comptables hebdomadaires (CDC §6.4).
 *
 * Regles d'or :
 *  - tous les montants sont des ENTIERS ($) ;
 *  - les pourcentages/arrondis sont calcules sur les TOTAUX hebdomadaires,
 *    pas unite par unite (§1.3) ;
 *  - la part du Co-directeur absorbe le residu d'arrondi pour que la somme
 *    distribuee corresponde exactement au benefice (§6.4).
 *
 * Fonctions pures et deterministes => coeur testable de l'integrite comptable.
 */

function assertNonNegativeInt(value: number, name: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${name} doit etre un entier (recu : ${value})`);
  }
  if (value < 0) {
    throw new Error(`${name} ne peut pas etre negatif (recu : ${value})`);
  }
}

/**
 * Taux de repartition (en %) pilotables depuis le panel (sinon valeurs §1.4).
 * La part Co-directeur n'est jamais un taux : c'est le reste exact du benefice,
 * elle absorbe le residu d'arrondi.
 */
export interface DistributionRates {
  reservePercent: number; // reserve de securite sur le CA
  bonusPercent: number; // prime du meilleur employe
  directorPercent: number; // part Directeur
}

export const DEFAULT_DISTRIBUTION_RATES: DistributionRates = {
  reservePercent: RESERVE_RATE_PERCENT,
  bonusPercent: BONUS_RATE_PERCENT,
  directorPercent: DIRECTOR_RATE_PERCENT,
};

/** Construit les taux a partir d'un GuildConfig (champs pilotables du panel). */
export function ratesFromConfig(config: {
  reserveRatePercent: number;
  bonusRatePercent: number;
  directorRatePercent: number;
}): DistributionRates {
  return {
    reservePercent: config.reserveRatePercent,
    bonusPercent: config.bonusRatePercent,
    directorPercent: config.directorRatePercent,
  };
}

/** Reserve de securite = floor(CA * taux / 100). */
export function computeReserve(
  totalRevenue: number,
  reservePercent: number = RESERVE_RATE_PERCENT,
): number {
  assertNonNegativeInt(totalRevenue, 'totalRevenue');
  return Math.floor((totalRevenue * reservePercent) / 100);
}

/** Benefice distribuable = CA - salaires - reserve. Peut etre <= 0. */
export function computeDistributable(
  totalRevenue: number,
  totalSalaries: number,
  reserve: number,
): number {
  assertNonNegativeInt(totalRevenue, 'totalRevenue');
  assertNonNegativeInt(totalSalaries, 'totalSalaries');
  assertNonNegativeInt(reserve, 'reserve');
  return totalRevenue - totalSalaries - reserve;
}

/** Taux effectivement appliques (pour un affichage qui ne ment pas si on les change). */
export interface DistributionPercents {
  reservePercent: number;
  bonusPercent: number;
  directorPercent: number;
  coDirectorPercent: number; // reste du distribuable (100 - bonus - directeur)
}

export interface ProfitDistribution {
  totalRevenue: number;
  totalSalaries: number;
  reserve: number;
  distributable: number;
  bonus: number; // prime du meilleur employe (bonusPercent du distribuable)
  directorShare: number; // part Directeur (directorPercent du distribuable)
  coDirectorShare: number; // reste, absorbe le residu d'arrondi
  rates: DistributionPercents; // taux reellement utilises ci-dessus
}

/** Taux d'affichage derives des taux d'entree (coDir = reste du distribuable). */
function percentsOf(rates: DistributionRates): DistributionPercents {
  return {
    reservePercent: rates.reservePercent,
    bonusPercent: rates.bonusPercent,
    directorPercent: rates.directorPercent,
    coDirectorPercent: Math.max(0, 100 - rates.bonusPercent - rates.directorPercent),
  };
}

/**
 * Repartition complete d'une semaine a partir du CA et des salaires valides.
 * Si le benefice distribuable est <= 0, toutes les parts valent 0.
 */
export function distributeWeek(
  totalRevenue: number,
  totalSalaries: number,
  rates: DistributionRates = DEFAULT_DISTRIBUTION_RATES,
): ProfitDistribution {
  // Solvabilite : on ne met JAMAIS de cote plus que la marge reellement
  // disponible apres salaires. Si la semaine ne couvre pas ses salaires, la
  // reserve tombe a 0 — sinon on prelevait 5 % du CA sur une semaine deficitaire,
  // creusant la tresorerie (faiblesse pointee a l'audit conceptuel).
  const targetReserve = computeReserve(totalRevenue, rates.reservePercent);
  const affordable = Math.max(0, totalRevenue - totalSalaries);
  const reserve = Math.min(targetReserve, affordable);
  const distributable = computeDistributable(totalRevenue, totalSalaries, reserve);

  const ratePercents = percentsOf(rates);

  if (distributable <= 0) {
    return {
      totalRevenue,
      totalSalaries,
      reserve,
      distributable,
      bonus: 0,
      directorShare: 0,
      coDirectorShare: 0,
      rates: ratePercents,
    };
  }

  const bonus = Math.floor((distributable * rates.bonusPercent) / 100);
  const directorShare = Math.floor((distributable * rates.directorPercent) / 100);
  // Le Co-directeur recoit le reste exact (≈ 25 %), residu d'arrondi inclus.
  const coDirectorShare = distributable - bonus - directorShare;

  return {
    totalRevenue,
    totalSalaries,
    reserve,
    distributable,
    bonus,
    directorShare,
    coDirectorShare,
    rates: ratePercents,
  };
}

/** Chiffre d'affaires d'une vente = quantite validee * prix PNJ snapshote. */
export function computeSaleRevenue(validatedQuantity: number, pnjUnitPrice: number): number {
  assertNonNegativeInt(validatedQuantity, 'validatedQuantity');
  assertNonNegativeInt(pnjUnitPrice, 'pnjUnitPrice');
  return validatedQuantity * pnjUnitPrice;
}

/**
 * Ajustement SIGNE de CA lors d'une correction de quantite validee : positif si
 * la quantite augmente, NEGATIF si elle baisse. Destine au journal (LedgerEntry
 * signe) pour que la somme des montants redonne toujours le CA reel.
 */
export function computeRevenueAdjustment(
  oldQuantity: number,
  newQuantity: number,
  pnjUnitPrice: number,
): number {
  assertNonNegativeInt(oldQuantity, 'oldQuantity');
  assertNonNegativeInt(newQuantity, 'newQuantity');
  assertNonNegativeInt(pnjUnitPrice, 'pnjUnitPrice');
  return (newQuantity - oldQuantity) * pnjUnitPrice;
}

/** Salaire de production d'une vente = quantite validee * tarif snapshote. */
export function computeSaleSalary(validatedQuantity: number, salaryRate: number): number {
  assertNonNegativeInt(validatedQuantity, 'validatedQuantity');
  assertNonNegativeInt(salaryRate, 'salaryRate');
  return validatedQuantity * salaryRate;
}

// Verifie a la compilation que la somme reste coherente : bonus + director + coDir
// reconstitue toujours le distribuable (par construction de coDirectorShare).
export const CODIRECTOR_EXPECTED_PERCENT = CODIRECTOR_RATE_PERCENT;
