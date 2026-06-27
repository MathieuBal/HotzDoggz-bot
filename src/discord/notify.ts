import { type BaseMessageOptions, ChannelType, type Client, type Guild } from 'discord.js';
import { logger } from '../infrastructure/logging/logger.js';

/** Sous-ensemble de GuildConfig utile aux notifications. */
export interface NotifyConfig {
  channelLogs: string | null;
  roleDirecteur: string | null;
  roleCoDirecteur: string | null;
}

/** Mentions des roles de direction presents en config. */
export function mentionDirection(config: NotifyConfig): string {
  return [config.roleDirecteur, config.roleCoDirecteur]
    .filter((id): id is string => Boolean(id))
    .map((id) => `<@&${id}>`)
    .join(' ');
}

/**
 * Publie un message dans le salon logs-et-archives (CDC §5.6 / §10.3).
 * Silencieux et non bloquant : un echec de notification ne casse pas le flux.
 */
export async function postToLogs(
  guild: Guild,
  config: NotifyConfig,
  payload: BaseMessageOptions,
): Promise<void> {
  if (!config.channelLogs) return;
  try {
    const channel = await guild.channels.fetch(config.channelLogs);
    if (channel && channel.type === ChannelType.GuildText) {
      await channel.send(payload);
    }
  } catch (err) {
    logger.warn({ err, channelId: config.channelLogs }, 'Echec de publication dans les logs');
  }
}

/**
 * Envoie un message prive a un employe (best-effort). Silencieux si l'employe a
 * ferme ses DM : une notification ratee ne casse jamais le flux metier.
 */
export async function sendEmployeeDM(
  client: Client,
  discordUserId: string,
  content: string,
): Promise<void> {
  try {
    const user = await client.users.fetch(discordUserId);
    await user.send(content);
  } catch (err) {
    logger.info({ err, discordUserId }, 'DM employe non remis (DM fermes ?)');
  }
}
