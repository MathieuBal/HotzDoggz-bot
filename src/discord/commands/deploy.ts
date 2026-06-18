import { REST, Routes } from 'discord.js';
import { loadEnv } from '../../config/env.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { commandData } from './index.js';

/**
 * Enregistre les slash commands aupres de Discord.
 * - Si DISCORD_GUILD_ID est defini : enregistrement de guilde (instantane), ideal en dev.
 * - Sinon : enregistrement global (propagation plus lente).
 *
 * Usage : `npm run commands:deploy`
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

  if (env.DISCORD_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
      body: commandData,
    });
    logger.info(
      { count: commandData.length, guildId: env.DISCORD_GUILD_ID },
      'Commandes de guilde enregistrees',
    );
  } else {
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: commandData });
    logger.info({ count: commandData.length }, 'Commandes globales enregistrees');
  }
}

main().catch((err) => {
  logger.error({ err }, 'Echec de l’enregistrement des commandes');
  process.exit(1);
});
