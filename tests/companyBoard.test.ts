import { describe, expect, it } from 'vitest';
import { formatDelta } from '../src/modules/dashboards/embeds.js';

describe('formatDelta', () => {
  it('ne montre rien sans semaine de reference', () => {
    expect(formatDelta(100, null)).toBe('');
  });

  it('indique "nouveau" quand la reference est nulle mais qu’il y a du volume', () => {
    expect(formatDelta(50, 0)).toBe(' _(nouveau)_');
    expect(formatDelta(0, 0)).toBe('');
  });

  it('calcule une hausse en pourcentage', () => {
    expect(formatDelta(112, 100)).toBe(' (+12 %)');
  });

  it('calcule une baisse en pourcentage', () => {
    expect(formatDelta(95, 100)).toBe(' (-5 %)');
  });

  it('affiche l’egalite', () => {
    expect(formatDelta(100, 100)).toBe(' (=)');
  });
});
