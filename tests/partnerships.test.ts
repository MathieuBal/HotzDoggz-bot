import { describe, expect, it } from 'vitest';
import { progressBar } from '../src/modules/dashboards/embeds.js';

describe('progressBar', () => {
  it('rend une barre proportionnelle', () => {
    expect(progressBar(5, 10, 10)).toBe('█████░░░░░');
    expect(progressBar(0, 10, 10)).toBe('░░░░░░░░░░');
    expect(progressBar(10, 10, 10)).toBe('██████████');
  });

  it('plafonne à 100 % au-delà de l’objectif', () => {
    expect(progressBar(25, 10, 10)).toBe('██████████');
  });

  it('gère un objectif nul/invalide', () => {
    expect(progressBar(5, 0, 10)).toBe('░░░░░░░░░░');
  });
});
