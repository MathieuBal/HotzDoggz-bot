import type { Client } from 'discord.js';
import { Ticker } from '../../infrastructure/scheduling/ticker.js';
import { runProactiveChecks } from './proactive.js';

// Intervalle de passage des notifications proactives. 15 min suffit a detecter
// la fenetre du dimanche soir et a relancer les ventes en attente sans spammer.
const INTERVAL_MS = 15 * 60_000;

let ticker: Ticker | null = null;

/** Demarre la boucle de notifications proactives (au demarrage du bot). */
export function startProactiveNotifications(client: Client): void {
  if (ticker) return;
  ticker = new Ticker(INTERVAL_MS, () => runProactiveChecks(client), 'proactive-notifications');
  ticker.start();
}

/** Arrete la boucle (arret gracieux). */
export function stopProactiveNotifications(): void {
  ticker?.stop();
  ticker = null;
}
