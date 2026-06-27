import { describe, expect, it } from 'vitest';
import {
  formatBadge,
  unitBadgesReached,
  revenueBadgesReached,
  contributionBadgesReached,
  badgeByKey,
} from '../src/modules/badges/registry.js';

describe('unitBadgesReached', () => {
  it('ne débloque rien sous le 1er palier', () => {
    expect(unitBadgesReached(0)).toHaveLength(0);
  });
  it('débloque les paliers atteints, cumulés', () => {
    const keys = unitBadgesReached(600).map((b) => b.key);
    expect(keys).toEqual(['first_sale', 'units_100', 'units_500']);
    expect(keys).not.toContain('units_1000');
  });
  it('garde toujours un palier au-dessus pour les farmeurs', () => {
    // a 5000 on a les 5 premiers, mais pas encore les paliers etendus (10k+).
    expect(unitBadgesReached(5_000)).toHaveLength(5);
    expect(unitBadgesReached(100_000)).toHaveLength(9); // echelle complete
    expect(unitBadgesReached(99_999).some((b) => b.key === 'units_100000')).toBe(false);
  });
});

describe('revenueBadgesReached', () => {
  it('débloque par paliers de CA cumulé', () => {
    expect(revenueBadgesReached(0)).toHaveLength(0);
    expect(revenueBadgesReached(500_000).map((b) => b.key)).toEqual(['rev_100k', 'rev_500k']);
    expect(revenueBadgesReached(10_000_000)).toHaveLength(5);
  });
});

describe('contributionBadgesReached', () => {
  it('inclut les paliers hauts', () => {
    expect(contributionBadgesReached(250).map((b) => b.key)).toContain('contrib_250');
    expect(contributionBadgesReached(9)).toHaveLength(0);
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
