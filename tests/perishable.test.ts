import { describe, expect, it } from 'vitest';
import {
  HOTDOG_LIFETIME_MS,
  expiryOf,
  formatCountdown,
} from '../src/modules/stock/perishable.js';

describe('peremption hot dogs (6j17h)', () => {
  it('la duree de vie vaut 6 jours et 17 heures', () => {
    expect(HOTDOG_LIFETIME_MS).toBe((6 * 24 + 17) * 3600 * 1000);
  });

  it('expiryOf ajoute la duree de vie', () => {
    const made = new Date('2026-06-01T12:00:00.000Z');
    expect(expiryOf(made).getTime()).toBe(made.getTime() + HOTDOG_LIFETIME_MS);
  });

  it('formatCountdown affiche jours et heures', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const exp = new Date(now.getTime() + (2 * 24 + 3) * 3600 * 1000);
    expect(formatCountdown(exp, now)).toBe('2j 3h');
  });

  it('formatCountdown bascule en heures/min sous 1 jour', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const exp = new Date(now.getTime() + (5 * 3600 + 30 * 60) * 1000);
    expect(formatCountdown(exp, now)).toBe('5h 30min');
  });

  it('formatCountdown indique expiré quand c’est passé', () => {
    const now = new Date('2026-06-02T00:00:00.000Z');
    const exp = new Date('2026-06-01T00:00:00.000Z');
    expect(formatCountdown(exp, now)).toBe('expiré');
  });
});
