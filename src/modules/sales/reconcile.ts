import { ChannelType, type Client } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { getGuildConfigByGuildId } from '../employees/employeeService.js';
import { ingestThread } from './ingestionService.js';

/**
 * Reconciliation au demarrage (CDC §11.1) : detecte les posts de casier crees
 * pendant que le bot etait hors ligne et les ingere. Idempotent grace a la cle
 * threadId — aucun doublon ni recalcul.
 */
export async function reconcileActiveThreads(client: Client): Promise<number> {
  let scanned = 0;
  for (const guild of client.guilds.cache.values()) {
    const config = await getGuildConfigByGuildId(guild.id);
    if (!config) continue;

    const lockers = await prisma.employee.findMany({
      where: { guildConfigId: config.id, status: 'ACTIVE', NOT: { casierForumId: null } },
      select: { casierForumId: true },
    });

    for (const locker of lockers) {
      const forumId = locker.casierForumId;
      if (!forumId) continue;
      const channel = await guild.channels.fetch(forumId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildForum) continue;

      const active = await channel.threads.fetchActive().catch(() => null);
      if (!active) continue;
      for (const thread of active.threads.values()) {
        scanned++;
        await ingestThread(thread).catch((err) =>
          logger.error({ err, threadId: thread.id }, 'Reconciliation : ingestion KO'),
        );
      }
    }
  }
  logger.info({ scanned }, 'Reconciliation des casiers terminee');
  return scanned;
}
