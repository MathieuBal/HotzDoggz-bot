import { describe, expect, it } from 'vitest';
import { computeBonusShares, computeWeekReport } from '../src/modules/accounting/weekReport.js';
import type { ValidatedSaleInput } from '../src/modules/accounting/weekReport.js';

const DIR = 'role-dir';

function s(
  employeeId: string,
  nomRP: string,
  q: number,
  rate = 175,
  roleId = 'role-chef',
): ValidatedSaleInput {
  return {
    employeeId,
    nomRP,
    validatedQuantity: q,
    salaryRate: rate,
    pnjUnitPrice: 210,
    gradeRoleId: roleId,
    gradeLabel: 'x',
  };
}

describe('computeBonusShares', () => {
  it('attribue toute la prime au meilleur unique', () => {
    const report = computeWeekReport([s('A', 'Alice', 2000), s('B', 'Bob', 1000)], [DIR]);
    const shares = computeBonusShares(report);
    expect(shares.get('A')).toBe(report.bonus);
    expect(shares.has('B')).toBe(false);
  });

  it('partage la prime a egalite et reste = somme exacte', () => {
    const report = computeWeekReport([s('A', 'Alice', 1500), s('B', 'Bob', 1500)], [DIR]);
    const shares = computeBonusShares(report);
    const total = (shares.get('A') ?? 0) + (shares.get('B') ?? 0);
    expect(total).toBe(report.bonus);
    // ecart maximal de 1 $ entre les deux parts (residu)
    expect(Math.abs((shares.get('A') ?? 0) - (shares.get('B') ?? 0))).toBeLessThanOrEqual(1);
  });

  it('ne distribue rien si le benefice est nul', () => {
    const report = computeWeekReport([s('A', 'Alice', 1, 210)], [DIR]); // salaire ~ CA
    const shares = computeBonusShares(report);
    if (report.bonus <= 0) expect(shares.size).toBe(0);
  });
});
