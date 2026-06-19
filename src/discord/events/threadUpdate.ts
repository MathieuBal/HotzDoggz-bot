import { Events, type Client } from 'discord.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { ingestThread } from '../../modules/sales/ingestionService.js';

/**
 * Re-analyse d'un post lorsque ses tags changent (CDC §7.1). Cas principal :
 * l'employe ajoute le tag « Nouvelle vente » oublie au depart. On force une
 * nouvelle evaluation (court-circuit de la fenetre anti-doublon) uniquement si
 * des tags ont ete *ajoutes* ; ingestThread reste idempotent si la vente existe.
 */
export function registerThreadUpdate(client: Client): void {
  client.on(Events.ThreadUpdate, async (oldThread, newThread) => {
    try {
      const added = newThread.appliedTags.some((t) => !oldThread.appliedTags.includes(t));
      if (!added) return;
      await ingestThread(newThread, true);
    } catch (err) {
      logger.error({ err, threadId: newThread.id }, 'threadUpdate : re-analyse KO');
    }
  });
}
