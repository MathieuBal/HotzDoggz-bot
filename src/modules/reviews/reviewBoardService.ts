import type { Client } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { KeyedSerialQueue } from '../../infrastructure/scheduling/debouncer.js';
import { buildReviewBoardMessage } from './embeds.js';
import { getReviewStats } from './reviewService.js';

// Serialise les mises a jour du bandeau par serveur (evite les doublons).
const queue = new KeyedSerialQueue();

/**
 * Met a jour le bandeau "avis clients" (note moyenne + bouton).
 *
 * `sticky` (defaut false) : re-poste le bandeau en bas du salon — utile UNIQUEMENT
 * a l'arrivee d'un nouvel avis, pour que le bouton reste sous la derniere carte.
 * Sinon (demarrage, config, moderation), on edite le message existant en place :
 * pas de spam d'un nouveau message a chaque redemarrage.
 */
export function updateReviewBoard(
  client: Client,
  guildConfigId: string,
  opts: { sticky?: boolean } = {},
): Promise<void> {
  return queue.enqueue(`reviews:${guildConfigId}`, () =>
    doUpdate(client, guildConfigId, opts.sticky ?? false),
  );
}

async function doUpdate(client: Client, guildConfigId: string, sticky: boolean): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelReviews) return;

  const channel = await client.channels.fetch(config.channelReviews).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    logger.warn({ channelId: config.channelReviews }, 'Salon avis introuvable ou non textuel');
    return;
  }

  const stats = await getReviewStats(guildConfigId);
  const payload = buildReviewBoardMessage(stats);

  if (config.msgReviewBoard) {
    if (!sticky) {
      // Edition en place : aucun nouveau message (pas de spam au redemarrage).
      try {
        const msg = await channel.messages.fetch(config.msgReviewBoard);
        await msg.edit(payload);
        return;
      } catch {
        // message supprime -> on le recree plus bas
      }
    } else {
      // Collant : on supprime l'ancien pour le reposter sous la derniere carte.
      await channel.messages
        .fetch(config.msgReviewBoard)
        .then((m) => m.delete())
        .catch(() => undefined);
    }
  }
  const created = await channel.send(payload);
  await prisma.guildConfig.update({
    where: { id: guildConfigId },
    data: { msgReviewBoard: created.id },
  });
}
