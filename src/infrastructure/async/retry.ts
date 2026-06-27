/**
 * Retry generique avec backoff exponentiel, pense pour les appels REST Discord
 * (et tout I/O transitoire). Par defaut on ne re-essaie QUE les erreurs
 * reellement transitoires (HTTP 429 / 5xx) : re-essayer un 403/404/Missing
 * Access ne ferait que retarder un echec certain.
 */

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const RETRIABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** Vrai si l'erreur porte un statut HTTP transitoire (429 ou 5xx). */
export function isTransient(err: unknown): boolean {
  const e = err as { status?: number; httpStatus?: number } | null;
  const status = e?.status ?? e?.httpStatus;
  return status !== undefined && RETRIABLE_STATUS.has(status);
}

export interface RetryOptions {
  attempts?: number; // nombre total de tentatives (defaut 3)
  baseDelayMs?: number; // delai de base, double a chaque tentative (defaut 300)
  shouldRetry?: (err: unknown) => boolean; // filtre des erreurs re-essayables
  onRetry?: (err: unknown, attempt: number) => void; // hook d'observabilite
}

/**
 * Execute `fn`, en re-essayant les echecs transitoires avec backoff (300, 600,
 * 1200 ms...). Relance la derniere erreur si toutes les tentatives echouent ou
 * si l'erreur n'est pas re-essayable.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 300;
  const shouldRetry = opts.shouldRetry ?? isTransient;

  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts - 1 || !shouldRetry(err)) throw err;
      opts.onRetry?.(err, attempt + 1);
      await sleep(base * 2 ** attempt);
    }
  }
  throw lastErr;
}
