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
    // 600 -> premiere vente (1) + premiere fournee (100), pas encore 1 000.
    expect(unitBadgesReached(600).map((b) => b.key)).toEqual(['first_sale', 'units_100']);
  });
  it('garde toujours un palier au-dessus pour les farmeurs', () => {
    expect(unitBadgesReached(100_000).map((b) => b.key)).toEqual([
      'first_sale',
      'units_100',
      'units_1k',
      'units_10k',
      'units_50k',
      'units_100k',
    ]);
    // Le sommet (2,5 M) reste hors de portee a 100k.
    expect(unitBadgesReached(100_000).some((b) => b.key === 'units_2_5m')).toBe(false);
    expect(unitBadgesReached(2_500_000)).toHaveLength(9); // echelle complete
  });
});

describe('revenueBadgesReached', () => {
  it('débloque par paliers de CA cumulé (echelle reelle)', () => {
    expect(revenueBadgesReached(500_000)).toHaveLength(0); // sous le 1er palier (1 M)
    expect(revenueBadgesReached(60_000_000).map((b) => b.key)).toEqual([
      'rev_1m',
      'rev_10m',
      'rev_50m',
    ]);
    expect(revenueBadgesReached(1_000_000_000)).toHaveLength(6); // jusqu'au milliard
  });
});

describe('contributionBadgesReached', () => {
  it('inclut les paliers hauts', () => {
    expect(contributionBadgesReached(250).map((b) => b.key)).toContain('contrib_250');
    expect(contributionBadgesReached(24)).toHaveLength(0); // sous le 1er palier (25)
  });
});

describe('registre', () => {
  it('résout une clé connue et formate', () => {
    const def = badgeByKey('units_50k');
    expect(def?.label).toBe('Maître du grill');
    expect(formatBadge(def!)).toContain('👑');
  });
  it('retourne undefined pour une clé inconnue/obsolète', () => {
    expect(badgeByKey('nope')).toBeUndefined();
  });
});
