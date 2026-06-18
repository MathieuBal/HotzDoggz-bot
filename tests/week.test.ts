import { describe, expect, it } from 'vitest';
import { computeIsoWeekBounds } from '../src/modules/accounting/week.js';

describe('computeIsoWeekBounds (Europe/Paris)', () => {
  it('encadre la semaine lundi -> dimanche pour un jeudi d’ete (UTC+2)', () => {
    // Jeudi 18 juin 2026, 12:00 UTC -> 14:00 Paris
    const now = new Date('2026-06-18T12:00:00.000Z');
    const { startAt, endAt } = computeIsoWeekBounds(now, 'Europe/Paris');
    // Lundi 15 juin 00:00 Paris = 14 juin 22:00 UTC
    expect(startAt.toISOString()).toBe('2026-06-14T22:00:00.000Z');
    // Dimanche 21 juin 23:59:59.999 Paris = 21 juin 21:59:59.999 UTC
    expect(endAt.toISOString()).toBe('2026-06-21T21:59:59.999Z');
  });

  it('gere un dimanche (toujours dans la meme semaine ISO)', () => {
    const now = new Date('2026-06-21T20:00:00.000Z'); // dimanche 22:00 Paris
    const { startAt, endAt } = computeIsoWeekBounds(now, 'Europe/Paris');
    expect(startAt.toISOString()).toBe('2026-06-14T22:00:00.000Z');
    expect(endAt.toISOString()).toBe('2026-06-21T21:59:59.999Z');
  });

  it('encadre une semaine d’hiver (UTC+1)', () => {
    const now = new Date('2026-01-15T12:00:00.000Z'); // jeudi 13:00 Paris
    const { startAt } = computeIsoWeekBounds(now, 'Europe/Paris');
    // Lundi 12 janvier 00:00 Paris = 11 janvier 23:00 UTC
    expect(startAt.toISOString()).toBe('2026-01-11T23:00:00.000Z');
  });
});
