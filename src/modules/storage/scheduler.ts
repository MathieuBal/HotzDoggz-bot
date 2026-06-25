import { loadEnv } from '../../config/env.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { Ticker } from '../../infrastructure/scheduling/ticker.js';
import { purgeExpiredProofs } from './purgeService.js';

// Passage quotidien : applique en continu la fenetre de retention, de sorte que
// rien ne depasse jamais durablement `STORAGE_RETENTION_DAYS` jours sur disque.
const INTERVAL_MS = 24 * 60 * 60_000;

let ticker: Ticker | null = null;

/** Demarre la purge periodique du stockage des preuves (au demarrage du bot). */
export function startStoragePurge(): void {
  if (ticker) return;
  const { STORAGE_RETENTION_DAYS } = loadEnv();
  const run = (): Promise<void> =>
    purgeExpiredProofs(STORAGE_RETENTION_DAYS)
      .then(() => undefined)
      .catch((err) => logger.error({ err }, 'Purge du stockage en echec'));

  ticker = new Ticker(INTERVAL_MS, run, 'storage-purge');
  ticker.start();
  // Un premier passage peu apres le demarrage (sans attendre 24 h).
  void run();
  logger.info({ retentionDays: STORAGE_RETENTION_DAYS }, 'Purge periodique du stockage activee');
}

/** Arrete la purge (arret gracieux). */
export function stopStoragePurge(): void {
  ticker?.stop();
  ticker = null;
}
