import { describe, expect, it } from 'vitest';
import { formatLeaderboard, type RankEntry } from '../src/modules/accounting/leaderboardService.js';

describe('formatLeaderboard', () => {
  it('affiche médailles, unités et CA dans l’ordre fourni', () => {
    const entries: RankEntry[] = [
      { nomRP: 'Alice', units: 300, revenue: 63_000 },
      { nomRP: 'Bob', units: 120, revenue: 25_200 },
    ];
    const lines = formatLeaderboard(entries).split('\n');
    expect(lines[0]).toContain('🥇');
    expect(lines[0]).toContain('Alice');
    expect(lines[0]).toContain('300');
    expect(lines[1]).toContain('🥈');
    expect(lines[1]).toContain('Bob');
  });

  it('numérote au-delà du podium', () => {
    const entries: RankEntry[] = Array.from({ length: 4 }, (_, i) => ({
      nomRP: `E${i}`,
      units: 10 - i,
      revenue: 0,
    }));
    expect(formatLeaderboard(entries).split('\n')[3]).toContain('4.');
  });

  it('gère le classement vide', () => {
    expect(formatLeaderboard([])).toContain('Aucune vente');
  });
});
