import { loadEnv } from './config/env.js';
import { createDiscordClient } from './discord/client.js';
import { registerEvents } from './discord/events/index.js';
import { disconnectPrisma, prisma } from './infrastructure/database/client.js';
import { logger } from './infrastructure/logging/logger.js';
import { flushDashboards } from './modules/dashboards/scheduler.js';
import { stopProactiveNotifications } from './modules/notifications/scheduler.js';

/**
 * Point d'entree du bot HotzDoggz.
 * Processus PERMANENT (CDC §8.5), pas une tache planifiee.
 */
async function main(): Promise<void> {
  const env = loadEnv();

  // Verifie tot que la base (source officielle) repond.
  await prisma.$queryRaw`SELECT 1`;
  logger.info('Connexion PostgreSQL etablie');

  const client = createDiscordClient();
  registerEvents(client);

  // Arret gracieux : on ferme proprement Gateway + pool DB.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Arret en cours...');
    try {
      stopProactiveNotifications();
      await flushDashboards();
      await client.destroy();
      await disconnectPrisma();
    } catch (err) {
      logger.error({ err }, 'Erreur durant l’arret');
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) =>
    logger.error({ reason }, 'Rejet de promesse non gere'),
  );
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Exception non capturee');
    void shutdown('uncaughtException');
  });

  await client.login(env.DISCORD_TOKEN);
}

main().catch((err) => {
  logger.fatal({ err }, 'Echec du demarrage du bot');
  process.exit(1);
});
