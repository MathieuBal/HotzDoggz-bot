import { describe, expect, it } from 'vitest';
import {
  computeDistributable,
  computeReserve,
  computeSaleRevenue,
  computeSaleSalary,
  distributeWeek,
} from '../src/modules/accounting/finance.js';

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
