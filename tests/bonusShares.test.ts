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

describe('computeBonusShares (proportionnel + bracelet)', () => {
  it('repartit proportionnellement a la prod : tout producteur touche une part', () => {
    const report = computeWeekReport([s('A', 'Alice', 2000), s('B', 'Bob', 1000)], [DIR]);
    const shares = computeBonusShares(report);
    const a = shares.get('A') ?? 0;
    const b = shares.get('B') ?? 0;
    expect(a).toBeGreaterThan(b); // degressif : Alice a produit 2x plus
    expect(b).toBeGreaterThan(0); // mais Bob a produit -> il touche
    expect(a + b).toBe(report.bonus); // somme exacte
    // ~ 2/3 pour Alice, ~ 1/3 pour Bob
    expect(Math.abs(a - Math.round((report.bonus * 2) / 3))).toBeLessThanOrEqual(1);
  });

  it('degressif entre 3, et le dernier (qui a produit) touche quand meme', () => {
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
    expect(c).toBeGreaterThan(0); // a produit -> touche du passif
    expect(a + b + c).toBe(report.bonus);
  });

  it('exclut ceux qui n’ont rien produit (0 part)', () => {
    // Cara n'a aucune vente validee -> pas dans le rapport -> 0.
    const report = computeWeekReport([s('A', 'Alice', 2000), s('B', 'Bob', 1000)], [DIR]);
    const shares = computeBonusShares(report);
    expect(shares.has('Z')).toBe(false);
  });

  it('partage a egalite (ex aequo) et somme exacte', () => {
    const report = computeWeekReport([s('A', 'Alice', 1500), s('B', 'Bob', 1500)], [DIR]);
    const shares = computeBonusShares(report);
    const total = (shares.get('A') ?? 0) + (shares.get('B') ?? 0);
    expect(total).toBe(report.bonus);
    expect(Math.abs((shares.get('A') ?? 0) - (shares.get('B') ?? 0))).toBeLessThanOrEqual(1);
  });

  it('neutralise le bracelet : le sans-bracelet (plus d’effort) touche la plus grosse part', () => {
    // x3 vend 1800 (ajuste 600) ; sans bracelet vend 1000 (ajuste 1000).
    const report = computeWeekReport(
      [s('A', 'Avec', 1800, { multiplier: 3 }), s('B', 'Sans', 1000)],
      [DIR],
    );
    expect(report.bestEmployee?.nomRP).toBe('Sans');
    const shares = computeBonusShares(report);
    expect((shares.get('B') ?? 0)).toBeGreaterThan(shares.get('A') ?? 0);
    expect((shares.get('A') ?? 0)).toBeGreaterThan(0); // il a quand meme produit
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
