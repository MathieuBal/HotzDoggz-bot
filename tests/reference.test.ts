import { describe, expect, it } from 'vitest';
import { formatSaleReference, parseSaleReference } from '../src/modules/sales/reference.js';

describe('formatSaleReference', () => {
  it('formate sur 4 chiffres minimum', () => {
    expect(formatSaleReference(2026, 42)).toBe('HD-2026-0042');
    expect(formatSaleReference(2026, 1)).toBe('HD-2026-0001');
    expect(formatSaleReference(2026, 12345)).toBe('HD-2026-12345');
  });

  it('rejette les entrees invalides', () => {
    expect(() => formatSaleReference(1999, 1)).toThrow();
    expect(() => formatSaleReference(2026, 0)).toThrow();
    expect(() => formatSaleReference(2026, -3)).toThrow();
  });
});

describe('parseSaleReference', () => {
  it('fait l’aller-retour', () => {
    const ref = formatSaleReference(2026, 42);
    expect(parseSaleReference(ref)).toEqual({ year: 2026, sequence: 42 });
  });

  it('retourne null sur une reference invalide', () => {
    expect(parseSaleReference('VENTE-42')).toBeNull();
    expect(parseSaleReference('HD-26-0042')).toBeNull();
  });
});
