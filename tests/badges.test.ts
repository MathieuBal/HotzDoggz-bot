import { describe, expect, it } from 'vitest';
import { formatBadge, unitBadgesReached, badgeByKey } from '../src/modules/badges/registry.js';

describe('unitBadgesReached', () => {
  it('ne débloque rien sous le 1er palier', () => {
    expect(unitBadgesReached(0)).toHaveLength(0);
  });
  it('débloque les paliers atteints, cumulés', () => {
    const keys = unitBadgesReached(600).map((b) => b.key);
    expect(keys).toEqual(['first_sale', 'units_100', 'units_500']);
    expect(keys).not.toContain('units_1000');
  });
  it('débloque tout au sommet', () => {
    expect(unitBadgesReached(5000)).toHaveLength(5);
  });
});

describe('registre', () => {
  it('résout une clé connue et formate', () => {
    const def = badgeByKey('units_1000');
    expect(def?.label).toBe('Maître du grill');
    expect(formatBadge(def!)).toContain('🥇');
  });
  it('retourne undefined pour une clé inconnue/obsolète', () => {
    expect(badgeByKey('nope')).toBeUndefined();
  });
});
