import { Events, type Client } from 'discord.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { ingestThread } from '../../modules/sales/ingestionService.js';

/**
 * Re-analyse lorsqu'un employe corrige le message initial d'un post (CDC §7.1) :
 * quantite mal ecrite, complement ajoute... Seul le message *initial* du post de
 * casier est concerne (son id est egal a celui du thread). On force une nouvelle
 * evaluation ; ingestThread reste idempotent si la vente existe deja.
 */
export function registerMessageUpdate(client: Client): void {
  client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
    try {
      const channel = newMessage.channel;
      if (!channel.isThread()) return;
      // Le message initial d'un post de forum partage l'id du thread.
      if (newMessage.id !== channel.id) return;
      if (newMessage.author?.bot) return;
      await ingestThread(channel, true);
    } catch (err) {
      logger.error({ err, threadId: newMessage.channelId }, 'messageUpdate : re-analyse KO');
    }
  });
}
