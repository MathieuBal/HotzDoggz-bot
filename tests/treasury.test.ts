import { describe, expect, it } from 'vitest';
import { summarizeLedger } from '../src/modules/accounting/treasuryService.js';

/**
 * Le flux de caisse net est strictement defini : CA encaisse + ajustements
 * signes - versements aux employes. Les allocations (reserve/prime/direction)
 * sont du detail informatif, jamais melangees au flux.
 */
describe('summarizeLedger', () => {
  it('calcule le flux net = revenue + ajustements - paiements', () => {
    const v = summarizeLedger({
      SALE_REVENUE: 100_000,
      ADJUSTMENT: -500,
      PAYMENT: 60_000,
      RESERVE_ALLOCATION: 5_000,
      BONUS_ALLOCATION: 12_000,
      DIRECTION_ALLOCATION: 20_000,
      SALARY_LIABILITY: 55_000,
    });
    expect(v.cashFlow).toBe(100_000 - 500 - 60_000);
    expect(v.revenue).toBe(100_000);
    expect(v.payments).toBe(60_000);
    expect(v.reserve).toBe(5_000);
    expect(v.direction).toBe(20_000);
  });

  it('traite les types absents comme 0', () => {
    const v = summarizeLedger({ SALE_REVENUE: 1_000 });
    expect(v.cashFlow).toBe(1_000);
    expect(v.payments).toBe(0);
    expect(v.bonus).toBe(0);
  });
});
