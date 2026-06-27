import { describe, expect, it } from 'vitest';
import {
  computeDistributable,
  computeReserve,
  computeRevenueAdjustment,
  computeSaleRevenue,
  computeSaleSalary,
  distributeWeek,
} from '../src/modules/accounting/finance.js';

describe('distributeWeek — solvabilité de la réserve', () => {
  it('plafonne la réserve à la marge disponible (semaine déficitaire)', () => {
    // CA 100, salaires 98 -> marge 2 ; reserve cible = 5 -> plafonnee a 2.
    const d = distributeWeek(100, 98, { reservePercent: 5, bonusPercent: 35, directorPercent: 40 });
    expect(d.reserve).toBe(2);
    expect(d.distributable).toBe(0);
    expect(d.totalRevenue - d.totalSalaries - d.reserve).toBeGreaterThanOrEqual(0);
  });

  it('réserve = 0 si les salaires dépassent le CA', () => {
    const d = distributeWeek(100, 120, { reservePercent: 5, bonusPercent: 35, directorPercent: 40 });
    expect(d.reserve).toBe(0);
  });

  it('semaine saine : réserve = taux plein', () => {
    const d = distributeWeek(100_000, 40_000, {
      reservePercent: 5,
      bonusPercent: 35,
      directorPercent: 40,
    });
    expect(d.reserve).toBe(5_000); // marge largement suffisante
  });
});

describe('distributeWeek — taux d’affichage (rates)', () => {
  it('expose les taux utilisés, coDir = reste du distribuable', () => {
    const d = distributeWeek(100_000, 40_000, {
      reservePercent: 5,
      bonusPercent: 35,
      directorPercent: 40,
    });
    expect(d.rates).toEqual({
      reservePercent: 5,
      bonusPercent: 35,
      directorPercent: 40,
      coDirectorPercent: 25, // 100 - 35 - 40
    });
  });

  it('reflète des taux personnalisés (l’affichage ne ment pas)', () => {
    const d = distributeWeek(100_000, 10_000, {
      reservePercent: 10,
      bonusPercent: 50,
      directorPercent: 30,
    });
    expect(d.rates.reservePercent).toBe(10);
    expect(d.rates.coDirectorPercent).toBe(20); // 100 - 50 - 30
  });
});

describe('computeRevenueAdjustment (journal signe)', () => {
  it('est positif quand la quantite validee augmente', () => {
    expect(computeRevenueAdjustment(10, 14, 210)).toBe(4 * 210);
  });

  it('est NEGATIF quand la quantite validee baisse (contre-passation)', () => {
    // Le bug corrige : un Math.abs aurait rendu +420 et gonfle le CA.
    expect(computeRevenueAdjustment(12, 10, 210)).toBe(-2 * 210);
  });

  it('vaut 0 quand la quantite ne change pas', () => {
    expect(computeRevenueAdjustment(7, 7, 210)).toBe(0);
  });

  it('rejette les entrees negatives ou non entieres', () => {
    expect(() => computeRevenueAdjustment(-1, 5, 210)).toThrow();
    expect(() => computeRevenueAdjustment(5, 5, 1.5)).toThrow();
  });
});

describe('computeReserve', () => {
  it('vaut floor(CA * 5 / 100)', () => {
    expect(computeReserve(210_000)).toBe(10_500);
    expect(computeReserve(210_001)).toBe(10_500); // arrondi a l'entier inferieur
    expect(computeReserve(0)).toBe(0);
  });

  it('rejette les montants non entiers ou negatifs', () => {
    expect(() => computeReserve(-1)).toThrow();
    expect(() => computeReserve(1.5)).toThrow();
  });
});

describe('exemple du cahier des charges (§1.5, Novice x1000)', () => {
  const totalRevenue = computeSaleRevenue(1000, 210); // 210 000
  const totalSalaries = computeSaleSalary(1000, 155); // 155 000

  it('reconstitue CA, salaires, reserve et benefice distribuable', () => {
    expect(totalRevenue).toBe(210_000);
    expect(totalSalaries).toBe(155_000);
    const reserve = computeReserve(totalRevenue);
    expect(reserve).toBe(10_500);
    expect(computeDistributable(totalRevenue, totalSalaries, reserve)).toBe(44_500);
  });

  it('repartit le benefice (35/40/25) avec residu absorbe par le Co-directeur', () => {
    const d = distributeWeek(totalRevenue, totalSalaries);
    expect(d.distributable).toBe(44_500);
    expect(d.bonus).toBe(15_575); // floor(44500 * 0.35)
    expect(d.directorShare).toBe(17_800); // floor(44500 * 0.40)
    expect(d.coDirectorShare).toBe(11_125); // reste exact (= 25 % ici)
    expect(d.bonus + d.directorShare + d.coDirectorShare).toBe(d.distributable);
  });
});

describe('distributeWeek - invariants', () => {
  it('la somme des parts egale toujours le distribuable (residu au Co-dir)', () => {
    for (let revenue = 0; revenue <= 50_000; revenue += 137) {
      const salaries = Math.floor(revenue * 0.6);
      const d = distributeWeek(revenue, salaries);
      if (d.distributable > 0) {
        expect(d.bonus + d.directorShare + d.coDirectorShare).toBe(d.distributable);
        expect(d.bonus).toBeGreaterThanOrEqual(0);
        expect(d.directorShare).toBeGreaterThanOrEqual(0);
        expect(d.coDirectorShare).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('met toutes les parts a 0 si le benefice distribuable est <= 0', () => {
    const d = distributeWeek(1000, 1000); // salaires >= CA
    expect(d.distributable).toBeLessThanOrEqual(0);
    expect(d.bonus).toBe(0);
    expect(d.directorShare).toBe(0);
    expect(d.coDirectorShare).toBe(0);
  });

  it('produit des montants entiers', () => {
    const d = distributeWeek(333_333, 100_000);
    for (const v of [d.reserve, d.distributable, d.bonus, d.directorShare, d.coDirectorShare]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
