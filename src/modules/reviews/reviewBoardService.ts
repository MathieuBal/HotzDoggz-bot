import type { Client } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { KeyedSerialQueue } from '../../infrastructure/scheduling/debouncer.js';
import { buildReviewBoardMessage } from './embeds.js';
import { getReviewStats } from './reviewService.js';

// Serialise les mises a jour du bandeau par serveur (evite les doublons).
const queue = new KeyedSerialQueue();

/**
 * Met a jour le bandeau "avis clients" (note moyenne + bouton). Le bandeau est
 * "collant" : on le re-poste en bas du salon a chaque avis pour que le bouton
 * reste toujours accessible sous les dernieres cartes.
 */
export function updateReviewBoard(client: Client, guildConfigId: string): Promise<void> {
  return queue.enqueue(`reviews:${guildConfigId}`, () => doUpdate(client, guildConfigId));
}

async function doUpdate(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelReviews) return;

  const channel = await client.channels.fetch(config.channelReviews).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    logger.warn({ channelId: config.channelReviews }, 'Salon avis introuvable ou non textuel');
    return;
  }

  const stats = await getReviewStats(guildConfigId);
  const payload = buildReviewBoardMessage(stats);

  // Supprime l'ancien bandeau pour le re-poster en dernier (toujours visible).
  if (config.msgReviewBoard) {
    await channel.messages
      .fetch(config.msgReviewBoard)
      .then((m) => m.delete())
      .catch(() => undefined);
  }
  const created = await channel.send(payload);
  await prisma.guildConfig.update({
    where: { id: guildConfigId },
    data: { msgReviewBoard: created.id },
  });
}
