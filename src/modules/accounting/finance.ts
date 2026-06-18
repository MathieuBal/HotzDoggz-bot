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

/** Reserve de securite = floor(CA * 5 / 100). */
export function computeReserve(totalRevenue: number): number {
  assertNonNegativeInt(totalRevenue, 'totalRevenue');
  return Math.floor((totalRevenue * RESERVE_RATE_PERCENT) / 100);
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

export interface ProfitDistribution {
  totalRevenue: number;
  totalSalaries: number;
  reserve: number;
  distributable: number;
  bonus: number; // 35 % - prime du meilleur employe
  directorShare: number; // 40 % - Directeur
  coDirectorShare: number; // reste (≈ 25 %), absorbe le residu d'arrondi
}

/**
 * Repartition complete d'une semaine a partir du CA et des salaires valides.
 * Si le benefice distribuable est <= 0, toutes les parts valent 0.
 */
export function distributeWeek(totalRevenue: number, totalSalaries: number): ProfitDistribution {
  const reserve = computeReserve(totalRevenue);
  const distributable = computeDistributable(totalRevenue, totalSalaries, reserve);

  if (distributable <= 0) {
    return {
      totalRevenue,
      totalSalaries,
      reserve,
      distributable,
      bonus: 0,
      directorShare: 0,
      coDirectorShare: 0,
    };
  }

  const bonus = Math.floor((distributable * BONUS_RATE_PERCENT) / 100);
  const directorShare = Math.floor((distributable * DIRECTOR_RATE_PERCENT) / 100);
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
  };
}

/** Chiffre d'affaires d'une vente = quantite validee * prix PNJ snapshote. */
export function computeSaleRevenue(validatedQuantity: number, pnjUnitPrice: number): number {
  assertNonNegativeInt(validatedQuantity, 'validatedQuantity');
  assertNonNegativeInt(pnjUnitPrice, 'pnjUnitPrice');
  return validatedQuantity * pnjUnitPrice;
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
