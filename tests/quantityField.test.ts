import { describe, expect, it } from 'vitest';
import { parseQuantityField } from '../src/modules/sales/quantity.js';

describe('parseQuantityField', () => {
  it('accepte un entier avec separateurs de milliers', () => {
    expect(parseQuantityField('2000')).toBe(2000);
    expect(parseQuantityField('1 980')).toBe(1980);
    expect(parseQuantityField('  12 500 ')).toBe(12500);
  });

  it('rejette les valeurs non numeriques ou nulles', () => {
    expect(parseQuantityField('abc')).toBeNull();
    expect(parseQuantityField('12x')).toBeNull();
    expect(parseQuantityField('0')).toBeNull();
    expect(parseQuantityField('')).toBeNull();
  });
});
