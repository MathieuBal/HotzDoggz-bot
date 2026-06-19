import { Events, type Client } from 'discord.js';
import { loadEnv } from '../../config/env.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { updateDashboardsNow } from '../../modules/dashboards/scheduler.js';
import { startProactiveNotifications } from '../../modules/notifications/scheduler.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { reconcileActiveThreads } from '../../modules/sales/reconcile.js';
import { commandData } from '../commands/index.js';

/**
 * Initialisation a la connexion (CDC Annexe A : ready/clientReady).
 * Synchronise les commandes puis reconcilie les posts crees hors-ligne (§11.1).
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

    try {
      await reconcileActiveThreads(c);
    } catch (err) {
      logger.error({ err }, 'Reconciliation au demarrage KO');
    }

    // Verifie/recree les tableaux permanents pour chaque serveur configure (§7.4).
    for (const guild of c.guilds.cache.values()) {
      const config = await getGuildConfigByGuildId(guild.id);
      if (config) {
        await updateDashboardsNow(c, config.id).catch((err) =>
          logger.warn({ err, guildId: guild.id }, 'Publication des tableaux au demarrage KO'),
        );
      }
    }

    // Notifications proactives (relances, rappel de cloture) — CDC §5.6.
    startProactiveNotifications(c);
  });
}
