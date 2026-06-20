import { Events, type Client } from 'discord.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { registerInteractionCreate } from './interactionCreate.js';
import { registerMessageCreate } from './messageCreate.js';
import { registerMessageDelete } from './messageDelete.js';
import { registerMessageUpdate } from './messageUpdate.js';
import { registerReady } from './ready.js';
import { registerThreadCreate } from './threadCreate.js';
import { registerThreadUpdate } from './threadUpdate.js';

/** Branche tous les handlers d'evenements Gateway sur le client. */
export function registerEvents(client: Client): void {
  registerReady(client);
  registerInteractionCreate(client);
  registerThreadCreate(client);
  registerThreadUpdate(client);
  registerMessageCreate(client);
  registerMessageUpdate(client);
  registerMessageDelete(client);

  // Observabilite (CDC §10.5 / Annexe A : error/shardError/invalidated)
  client.on(Events.Error, (err) => logger.error({ err }, 'Erreur client Discord'));
  client.on(Events.Warn, (msg) => logger.warn({ msg }, 'Avertissement client Discord'));
  client.on(Events.ShardError, (err) => logger.error({ err }, 'Erreur de shard'));
  client.on(Events.Invalidated, () => logger.fatal('Session Discord invalidee — arret requis'));
}
