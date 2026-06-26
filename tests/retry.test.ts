import { describe, expect, it, vi } from 'vitest';
import { isTransient, withRetry } from '../src/infrastructure/async/retry.js';

// baseDelayMs: 0 pour ne pas ralentir les tests.
const fast = { baseDelayMs: 0 };

describe('isTransient', () => {
  it('retient 429 et 5xx', () => {
    expect(isTransient({ status: 429 })).toBe(true);
    expect(isTransient({ status: 503 })).toBe(true);
    expect(isTransient({ httpStatus: 500 })).toBe(true);
  });
  it('ignore 4xx non transitoires et erreurs sans statut', () => {
    expect(isTransient({ status: 403 })).toBe(false);
    expect(isTransient({ status: 404 })).toBe(false);
    expect(isTransient(new Error('boom'))).toBe(false);
  });
});

describe('withRetry', () => {
  it('renvoie le resultat sans re-essayer si la 1re tentative reussit', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn, fast)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-essaie un echec transitoire puis reussit', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValue('ok');
    await expect(withRetry(fn, fast)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('ne re-essaie PAS une erreur non transitoire', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 403 });
    await expect(withRetry(fn, fast)).rejects.toEqual({ status: 403 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('abandonne apres le nombre de tentatives et relance la derniere erreur', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 500 });
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 0 })).rejects.toEqual({ status: 500 });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
