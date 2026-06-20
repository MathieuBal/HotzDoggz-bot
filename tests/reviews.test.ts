import { describe, expect, it } from 'vitest';
import { formatAverage, parseRating, stars } from '../src/modules/reviews/reviewInput.js';

describe('parseRating', () => {
  it('accepte 1 à 5', () => {
    expect(parseRating('1')).toBe(1);
    expect(parseRating('5')).toBe(5);
    expect(parseRating(' 4 ')).toBe(4);
  });

  it('arrondit une virgule', () => {
    expect(parseRating('4,6')).toBe(5);
  });

  it('rejette hors bornes ou non numérique', () => {
    expect(parseRating('0')).toBeNull();
    expect(parseRating('6')).toBeNull();
    expect(parseRating('abc')).toBeNull();
    expect(parseRating('')).toBeNull();
  });
});

describe('stars', () => {
  it('rend des étoiles pleines et vides', () => {
    expect(stars(4)).toBe('⭐⭐⭐⭐☆');
    expect(stars(5)).toBe('⭐⭐⭐⭐⭐');
    expect(stars(0)).toBe('☆☆☆☆☆');
  });
});

describe('formatAverage', () => {
  it('formate à une décimale en virgule française', () => {
    expect(formatAverage(4.25)).toBe('4,3');
    expect(formatAverage(5)).toBe('5,0');
  });
});
