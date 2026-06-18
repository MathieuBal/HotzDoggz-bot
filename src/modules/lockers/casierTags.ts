import type { ForumTagKey } from '@prisma/client';
import type { AnyThreadChannel } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';

/** Resout l'ID de tag Discord pour une cle interne, sur un Forum donne. */
export async function resolveTagId(
  forumChannelId: string,
  key: ForumTagKey,
): Promise<string | null> {
  const tag = await prisma.forumTag.findUnique({
    where: { forumChannelId_key: { forumChannelId, key } },
  });
  return tag?.discordTagId ?? null;
}

/**
 * Applique LE tag de statut courant a un post de casier (CDC §5.4).
 * Le statut interne reste la source de verite ; le tag n'est qu'une vue (§4.8).
 * Tolerant : si le tag n'est pas cartographie, on journalise sans echouer.
 */
export async function setCasierTag(
  thread: AnyThreadChannel,
  forumChannelId: string,
  key: ForumTagKey,
): Promise<boolean> {
  const tagId = await resolveTagId(forumChannelId, key);
  if (!tagId) {
    logger.warn({ forumChannelId, key }, 'Tag de casier non cartographie : application ignoree');
    return false;
  }
  try {
    await thread.setAppliedTags([tagId]);
    return true;
  } catch (err) {
    logger.warn({ err, threadId: thread.id, key }, 'Echec d’application du tag de casier');
    return false;
  }
}
