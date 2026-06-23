import { describe, expect, it } from 'vitest';
import { computeBonusShares, computeWeekReport } from '../src/modules/accounting/weekReport.js';
import type { ValidatedSaleInput } from '../src/modules/accounting/weekReport.js';

const DIR = 'role-dir';

function s(
  employeeId: string,
  nomRP: string,
  q: number,
  opts: { rate?: number; roleId?: string; multiplier?: number } = {},
): ValidatedSaleInput {
  return {
    employeeId,
    nomRP,
    validatedQuantity: q,
    salaryRate: opts.rate ?? 175,
    pnjUnitPrice: 210,
    gradeRoleId: opts.roleId ?? 'role-chef',
    gradeLabel: 'x',
    multiplier: opts.multiplier ?? 1,
  };
}

describe('computeBonusShares (degressive + bracelet)', () => {
  it('le dernier touche 0 et le premier la plus grosse part', () => {
    const report = computeWeekReport([s('A', 'Alice', 2000), s('B', 'Bob', 1000)], [DIR]);
    const shares = computeBonusShares(report);
    expect(shares.get('A')).toBe(report.bonus);
    expect(shares.has('B')).toBe(false); // dernier = 0
  });

  it('repartit de facon strictement degressive entre 3', () => {
    const report = computeWeekReport(
      [s('A', 'Alice', 3000), s('B', 'Bob', 2000), s('C', 'Cara', 1000)],
      [DIR],
    );
    const shares = computeBonusShares(report);
    const a = shares.get('A') ?? 0;
    const b = shares.get('B') ?? 0;
    const c = shares.get('C') ?? 0;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBe(0); // dernier
    expect(a + b + c).toBe(report.bonus); // somme exacte
  });

  it('partage a egalite (ex aequo) et reste = somme exacte', () => {
    const report = computeWeekReport([s('A', 'Alice', 1500), s('B', 'Bob', 1500)], [DIR]);
    const shares = computeBonusShares(report);
    const total = (shares.get('A') ?? 0) + (shares.get('B') ?? 0);
    expect(total).toBe(report.bonus);
    expect(Math.abs((shares.get('A') ?? 0) - (shares.get('B') ?? 0))).toBeLessThanOrEqual(1);
  });

  it('neutralise le bracelet : un x3 qui vend 2x plus passe DERRIERE un sans-bracelet', () => {
    // Bracelet x3 vend 1800 (ajuste 600) ; sans bracelet vend 1000 (ajuste 1000).
    const report = computeWeekReport(
      [s('A', 'Avec', 1800, { multiplier: 3 }), s('B', 'Sans', 1000)],
      [DIR],
    );
    expect(report.bestEmployee?.nomRP).toBe('Sans');
    const shares = computeBonusShares(report);
    expect(shares.get('B')).toBe(report.bonus); // le sans-bracelet rafle la part
    expect(shares.has('A')).toBe(false);
  });

  it('un seul eligible touche toute la prime', () => {
    const report = computeWeekReport([s('A', 'Alice', 2000)], [DIR]);
    const shares = computeBonusShares(report);
    expect(shares.get('A')).toBe(report.bonus);
  });

  it('ne distribue rien si le benefice est nul', () => {
    const report = computeWeekReport([s('A', 'Alice', 1, { rate: 210 })], [DIR]);
    const shares = computeBonusShares(report);
    if (report.bonus <= 0) expect(shares.size).toBe(0);
  });
});
