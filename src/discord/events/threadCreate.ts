import { Events, type Client } from 'discord.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { ingestThread } from '../../modules/sales/ingestionService.js';

/**
 * Detection principale d'un nouveau post de casier (CDC §4.2, Annexe A).
 * Toute la logique de controle/idempotence vit dans ingestThread.
 */
export function registerThreadCreate(client: Client): void {
  client.on(Events.ThreadCreate, async (thread) => {
    try {
      await ingestThread(thread);
    } catch (err) {
      logger.error({ err, threadId: thread.id }, 'threadCreate : ingestion KO');
    }
  });
}
