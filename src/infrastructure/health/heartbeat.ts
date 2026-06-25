import { writeFile } from 'node:fs/promises';
import type { Client } from 'discord.js';
import { logger } from '../logging/logger.js';
import { Ticker } from '../scheduling/ticker.js';

/**
 * Battement de coeur pour le healthcheck du conteneur. Le process ecrit
 * periodiquement un horodatage dans un fichier TANT QUE la Gateway est connectee.
 * Un healthcheck externe (Docker, cf. scripts/healthcheck.mjs) verifie la
 * fraicheur de ce fichier : si le bot est vivant mais "zombie" (event-loop
 * bloque, Gateway perdue durablement), le fichier vieillit et Docker redemarre
 * le conteneur. Complete la sortie sur `Invalidated` (cas session revoquee).
 */
const HEARTBEAT_FILE = process.env.HEALTHCHECK_FILE ?? '/tmp/hotzdoggz-heartbeat';
const HEARTBEAT_INTERVAL_MS = 30_000;

let ticker: Ticker | null = null;

export function startHeartbeat(client: Client): void {
  if (ticker) return;
  const beat = async (): Promise<void> => {
    if (!client.isReady()) return; // deconnecte => pas de battement => healthcheck echoue
    try {
      await writeFile(HEARTBEAT_FILE, String(Date.now()));
    } catch (err) {
      logger.warn({ err, file: HEARTBEAT_FILE }, 'Ecriture du heartbeat KO');
    }
  };
  void beat(); // premier battement immediat
  ticker = new Ticker(HEARTBEAT_INTERVAL_MS, beat, 'heartbeat');
  ticker.start();
}

export function stopHeartbeat(): void {
  ticker?.stop();
  ticker = null;
}
