import { describe, expect, it } from 'vitest';
import { formatOrderReference, parseOrderReference } from '../src/modules/orders/orderReference.js';
import {
  computeWeekReport,
  type ValidatedSaleInput,
} from '../src/modules/accounting/weekReport.js';

describe('orderReference', () => {
  it('formate une reference CMD-AAAA-NNNN', () => {
    expect(formatOrderReference(2026, 1)).toBe('CMD-2026-0001');
    expect(formatOrderReference(2026, 42)).toBe('CMD-2026-0042');
  });

  it('parse et fait l’aller-retour', () => {
    expect(parseOrderReference('CMD-2026-0042')).toEqual({ year: 2026, sequence: 42 });
  });

  it('rejette une reference de vente ou invalide', () => {
    expect(parseOrderReference('HD-2026-0042')).toBeNull();
    expect(parseOrderReference('n’importe quoi')).toBeNull();
  });
});

describe('computeWeekReport avec commandes client', () => {
  const pnjSale: ValidatedSaleInput = {
    employeeId: 'A',
    nomRP: 'Alex',
    validatedQuantity: 100,
    salaryRate: 155,
    pnjUnitPrice: 210,
    gradeRoleId: 'novice',
    gradeLabel: 'Novice',
  };
  // Contribution a une commande : meme employe, prix unitaire 0 (le CA est porte
  // par extraRevenue), seul le salaire est apporte par la ligne.
  const orderContribution: ValidatedSaleInput = {
    employeeId: 'A',
    nomRP: 'Alex',
    validatedQuantity: 250,
    salaryRate: 155,
    pnjUnitPrice: 0,
    gradeRoleId: 'novice',
    gradeLabel: 'Novice',
  };

  it('cumule production et salaire, et porte le CA de la commande une seule fois', () => {
    const report = computeWeekReport([pnjSale, orderContribution], [], 125_000);

    const alex = report.employees.find((e) => e.employeeId === 'A');
    expect(alex?.quantity).toBe(350); // 100 PNJ + 250 commande
    expect(alex?.salary).toBe(350 * 155);
    // CA = revenu PNJ (100*210) + prix negocie de la commande (125000).
    expect(report.totalRevenue).toBe(100 * 210 + 125_000);
    expect(report.totalSalaries).toBe(350 * 155);
    expect(report.bestEmployee?.employeeId).toBe('A');
  });

  it('exclut un contributeur de la direction de la prime', () => {
    const dirContribution: ValidatedSaleInput = {
      employeeId: 'D',
      nomRP: 'Patron',
      validatedQuantity: 500,
      salaryRate: 185,
      pnjUnitPrice: 0,
      gradeRoleId: 'dir',
      gradeLabel: 'Directeur',
    };
    const report = computeWeekReport([pnjSale, dirContribution], ['dir'], 200_000);
    // Le patron produit le plus mais reste hors prime ; Alex reste le meilleur eligible.
    expect(report.bestEmployee?.employeeId).toBe('A');
    expect(report.employees.find((e) => e.employeeId === 'D')?.eligible).toBe(false);
  });
});
