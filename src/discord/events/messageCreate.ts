import { Events, type Client, type Message } from 'discord.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { ingestThread } from '../../modules/sales/ingestionService.js';

/**
 * Fallback de detection (CDC §4.2 / §8.4) : le message initial peut arriver
 * apres l'evenement threadCreate. Sert aussi a la re-analyse d'un complement
 * (§7.1). ingestThread est idempotent : sans-effet si la vente existe deja ou
 * si le thread n'est pas un casier.
 */
export function registerMessageCreate(client: Client): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;
    if (!message.channel.isThread()) return;
    try {
      await ingestThread(message.channel);
    } catch (err) {
      logger.error({ err, threadId: message.channelId }, 'messageCreate : ingestion KO');
    }
  });
}
