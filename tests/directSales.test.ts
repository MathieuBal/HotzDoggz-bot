import { describe, expect, it } from 'vitest';
import {
  computeDirectSaleTotals,
  formatDirectSaleReference,
  parseDirectSaleReference,
} from '../src/modules/directSales/directSaleReference.js';

describe('directSaleReference', () => {
  it('formate et parse VD-AAAA-NNNN', () => {
    expect(formatDirectSaleReference(2026, 7)).toBe('VD-2026-0007');
    expect(parseDirectSaleReference('VD-2026-0007')).toEqual({ year: 2026, sequence: 7 });
  });

  it('rejette une reference d’un autre type', () => {
    expect(parseDirectSaleReference('HD-2026-0007')).toBeNull();
    expect(parseDirectSaleReference('CMD-2026-0007')).toBeNull();
  });
});

describe('computeDirectSaleTotals', () => {
  it('additionne un panier mixte (quantité totale + CA)', () => {
    // 2 Simple à 350 + 1 Truffe à 550 = 3 u, 1250 $
    const t = computeDirectSaleTotals([
      { unitPrice: 350, quantity: 2 },
      { unitPrice: 550, quantity: 1 },
    ]);
    expect(t.totalQuantity).toBe(3);
    expect(t.revenue).toBe(1250);
  });

  it('gère un panier vide', () => {
    expect(computeDirectSaleTotals([])).toEqual({ totalQuantity: 0, revenue: 0 });
  });
});
