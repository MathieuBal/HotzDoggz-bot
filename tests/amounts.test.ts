import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT, isAmountInRange } from '../src/config/constants.js';

describe('isAmountInRange', () => {
  it('accepte un entier dans [min, MAX_AMOUNT]', () => {
    expect(isAmountInRange(1)).toBe(true);
    expect(isAmountInRange(165)).toBe(true);
    expect(isAmountInRange(MAX_AMOUNT)).toBe(true);
  });

  it('rejette en dessous du minimum (defaut 1)', () => {
    expect(isAmountInRange(0)).toBe(false);
    expect(isAmountInRange(-5)).toBe(false);
    expect(isAmountInRange(0, 0)).toBe(true); // min surchargeable
  });

  it('rejette au-dela du plafond (saisie aberrante)', () => {
    expect(isAmountInRange(MAX_AMOUNT + 1)).toBe(false);
    expect(isAmountInRange(1e15)).toBe(false);
  });

  it('rejette NaN et non-entiers', () => {
    expect(isAmountInRange(Number.NaN)).toBe(false);
    expect(isAmountInRange(1.5)).toBe(false);
  });
});
