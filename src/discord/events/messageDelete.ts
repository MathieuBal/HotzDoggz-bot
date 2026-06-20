import { Events, type Client } from 'discord.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { removeReviewByMessageId } from '../../modules/reviews/reviewService.js';
import { updateReviewBoard } from '../../modules/reviews/reviewBoardService.js';

/**
 * Moderation des avis par suppression du message (CDC : salon public). Quand la
 * direction supprime la carte d'un avis, on masque l'avis en base et on met a
 * jour la note moyenne. Aucun bouton de suppression a afficher cote public.
 */
export function registerMessageDelete(client: Client): void {
  client.on(Events.MessageDelete, async (message) => {
    try {
      const guildConfigId = await removeReviewByMessageId(message.id);
      if (guildConfigId) await updateReviewBoard(client, guildConfigId);
    } catch (err) {
      logger.warn({ err, messageId: message.id }, 'Synchro suppression d’avis KO');
    }
  });
}
