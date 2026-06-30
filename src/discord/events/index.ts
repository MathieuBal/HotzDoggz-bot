import { Events, type Client } from 'discord.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { registerGuildMemberAdd } from './guildMemberAdd.js';
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
  registerGuildMemberAdd(client);
  registerThreadCreate(client);
  registerThreadUpdate(client);
  registerMessageCreate(client);
  registerMessageUpdate(client);
  registerMessageDelete(client);

  // Observabilite (CDC §10.5 / Annexe A : error/shardError/invalidated)
  client.on(Events.Error, (err) => logger.error({ err }, 'Erreur client Discord'));
  client.on(Events.Warn, (msg) => logger.warn({ msg }, 'Avertissement client Discord'));
  client.on(Events.ShardError, (err) => logger.error({ err }, 'Erreur de shard'));
  client.on(Events.ShardDisconnect, (event, id) =>
    logger.warn({ shardId: id, code: event.code }, 'Shard deconnecte'),
  );
  // Cycle de reconnexion/reprise normal de la Gateway (Discord recycle les
  // connexions toutes les quelques heures). Un Resume rejoue les evenements
  // manques sans perte de donnees : ce n'est PAS une alerte, on logge en debug
  // pour ne pas noyer les vrais signaux. Une vraie deconnexion (ShardDisconnect)
  // ou une session invalidee restent bruyantes.
  client.on(Events.ShardReconnecting, (id) => logger.debug({ shardId: id }, 'Shard reconnexion...'));
  client.on(Events.ShardResume, (id, replayed) =>
    logger.debug({ shardId: id, replayed }, 'Shard repris'),
  );

  // Session invalidee par Discord (token revoque, kick, abus de reconnexion) :
  // discord.js DETRUIT le client sans se reconnecter. Si on se contentait de
  // logger, le process resterait vivant mais mort (zombie) et Docker ne le
  // relancerait jamais. On force donc une sortie en code != 0 pour declencher
  // le redemarrage du conteneur (restart: unless-stopped), qui retentera login.
  client.on(Events.Invalidated, () => {
    logger.fatal('Session Discord invalidee — sortie pour forcer un redemarrage');
    process.exit(1);
  });
}
