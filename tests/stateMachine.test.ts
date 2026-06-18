import { SaleStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition } from '../src/modules/sales/stateMachine.js';

describe('machine a etats des ventes', () => {
  it('autorise les transitions du workflow de validation', () => {
    expect(canTransition(SaleStatus.SOUMISE, SaleStatus.EN_VERIFICATION)).toBe(true);
    expect(canTransition(SaleStatus.EN_VERIFICATION, SaleStatus.VALIDEE)).toBe(true);
    expect(canTransition(SaleStatus.SOUMISE, SaleStatus.REFUSEE)).toBe(true);
    expect(canTransition(SaleStatus.INCOMPLETE, SaleStatus.VALIDEE)).toBe(true);
    expect(canTransition(SaleStatus.VALIDEE, SaleStatus.INTEGREE_A_LA_PAIE)).toBe(true);
  });

  it('refuse les transitions incoherentes', () => {
    expect(canTransition(SaleStatus.PAYEE, SaleStatus.VALIDEE)).toBe(false);
    expect(canTransition(SaleStatus.VALIDEE, SaleStatus.SOUMISE)).toBe(false);
    expect(canTransition(SaleStatus.ANNULEE, SaleStatus.VALIDEE)).toBe(false);
  });

  it('assertTransition leve sur une transition interdite', () => {
    expect(() => assertTransition(SaleStatus.PAYEE, SaleStatus.SOUMISE)).toThrow();
    expect(() => assertTransition(SaleStatus.SOUMISE, SaleStatus.VALIDEE)).not.toThrow();
  });
});
