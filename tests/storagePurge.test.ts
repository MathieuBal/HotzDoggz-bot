import { describe, expect, it } from 'vitest';
import { planPurge, type PurgeableObject } from '../src/modules/storage/purgePlan.js';

const NOW = new Date('2026-06-24T12:00:00Z');
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * 24 * 60 * 60_000);

function obj(key: string, ageDays: number, size = 100): PurgeableObject {
  return { key, size, modifiedAt: daysAgo(ageDays) };
}

describe('planPurge (retention des preuves)', () => {
  const cutoff = daysAgo(30); // retention 30 jours

  it('supprime ce qui est plus vieux que la retention', () => {
    const plan = planPurge([obj('g/t/facture-1.png', 40)], cutoff, new Set());
    expect(plan.keys).toEqual(['g/t/facture-1.png']);
    expect(plan.bytes).toBe(100);
    expect(plan.kept).toBe(0);
  });

  it('conserve ce qui est plus recent que la retention', () => {
    const plan = planPurge([obj('g/t/facture-1.png', 5)], cutoff, new Set());
    expect(plan.keys).toEqual([]);
    expect(plan.kept).toBe(1);
  });

  it('ne purge jamais un asset durable protege, meme tres vieux', () => {
    const objects = [obj('g/t/menu-burger.png', 200), obj('g/t/facture-1.png', 200)];
    const plan = planPurge(objects, cutoff, new Set(['g/t/menu-burger.png']));
    expect(plan.keys).toEqual(['g/t/facture-1.png']);
    expect(plan.kept).toBe(1); // la photo du menu reste
  });

  it('agrege correctement les octets liberes', () => {
    const objects = [obj('a', 40, 250), obj('b', 50, 750), obj('c', 1, 999)];
    const plan = planPurge(objects, cutoff, new Set());
    expect(plan.keys.sort()).toEqual(['a', 'b']);
    expect(plan.bytes).toBe(1000);
    expect(plan.kept).toBe(1);
  });

  it('frontiere exacte : pile a la limite n’est pas expire', () => {
    // modifiedAt == cutoff => non strictement anterieur => conserve.
    const plan = planPurge([{ key: 'x', size: 1, modifiedAt: cutoff }], cutoff, new Set());
    expect(plan.keys).toEqual([]);
    expect(plan.kept).toBe(1);
  });
});
