import { Events, type Client } from 'discord.js';
import { loadEnv } from '../../config/env.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { commandData } from '../commands/index.js';

/**
 * Initialisation a la connexion (CDC Annexe A : ready/clientReady).
 * La reconciliation complete au demarrage (§11.1) sera branchee ici aux phases
 * ulterieures (verification des objets Discord, semaine ouverte, messages
 * permanents, threads non enregistres...).
 */
export function registerReady(client: Client): void {
  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag, id: c.user.id, guilds: c.guilds.cache.size }, 'Bot connecte');

    const env = loadEnv();
    if (env.DISCORD_GUILD_ID && c.application) {
      try {
        await c.application.commands.set(commandData, env.DISCORD_GUILD_ID);
        logger.info(
          { count: commandData.length, guildId: env.DISCORD_GUILD_ID },
          'Slash commands de guilde synchronisees',
        );
      } catch (err) {
        logger.error({ err }, 'Echec de synchronisation des slash commands');
      }
    }
  });
}
