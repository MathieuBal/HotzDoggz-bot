import { describe, expect, it } from 'vitest';
import {
  buildOrderDeliveredCelebration,
  buildPartnerObjectiveCelebration,
  formatContributors,
} from '../src/discord/celebrations.js';
import { justReached } from '../src/modules/partners/partnerService.js';

describe('justReached (franchissement d’objectif)', () => {
  it('vrai uniquement quand l’ajout fait passer la cible', () => {
    expect(justReached(80, 30, 100)).toBe(true); // 80 -> 110, franchit 100
    expect(justReached(100, 10, 100)).toBe(false); // deja atteint avant
    expect(justReached(50, 20, 100)).toBe(false); // pas encore atteint
  });
  it('faux si pas d’objectif', () => {
    expect(justReached(0, 999, null)).toBe(false);
  });
});

describe('buildPartnerObjectiveCelebration', () => {
  it('mentionne le partenaire et la cible', () => {
    const e = buildPartnerObjectiveCelebration('Bahama Mamas', 500).toJSON();
    expect(e.title).toContain('Objectif');
    expect(e.description).toContain('Bahama Mamas');
    expect(e.description).toContain('500');
  });
});

describe('formatContributors', () => {
  it('trie par volume décroissant avec médailles', () => {
    const out = formatContributors([
      { nomRP: 'Bob', quantity: 10 },
      { nomRP: 'Alice', quantity: 30 },
      { nomRP: 'Carol', quantity: 20 },
    ]);
    const lines = out.split('\n');
    expect(lines[0]).toContain('🥇');
    expect(lines[0]).toContain('Alice'); // plus gros producteur en tête
    expect(lines[2]).toContain('🥉');
    expect(lines[2]).toContain('Bob');
  });

  it('ignore les contributions nulles', () => {
    const out = formatContributors([
      { nomRP: 'Alice', quantity: 5 },
      { nomRP: 'Zero', quantity: 0 },
    ]);
    expect(out).not.toContain('Zero');
  });

  it('gère l’absence de contributeurs', () => {
    expect(formatContributors([])).toContain('Aucune contribution');
  });
});

describe('buildOrderDeliveredCelebration', () => {
  it('mentionne la référence, le client et les producteurs', () => {
    const embed = buildOrderDeliveredCelebration('CMD-2026-0042', 'Bahama Mamas', [
      { nomRP: 'Alice', quantity: 30 },
    ]).toJSON();
    expect(embed.title).toContain('CMD-2026-0042');
    expect(embed.description).toContain('Bahama Mamas');
    expect(embed.description).toContain('Alice');
  });
});
