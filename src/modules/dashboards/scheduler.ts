import type { Client } from 'discord.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { KeyedSerialQueue, SimpleDebouncer } from '../../infrastructure/scheduling/debouncer.js';
import { updateDashboards } from './dashboardService.js';

// Debounce court (CDC §5.5) puis execution serie par serveur (§7.4).
const debouncer = new SimpleDebouncer(1500);
const queue = new KeyedSerialQueue();

function key(guildConfigId: string): string {
  return `dashboards:${guildConfigId}`;
}

/** Programme une mise a jour des tableaux (coalesce les appels rapproches). */
export function scheduleDashboardUpdate(client: Client, guildConfigId: string): void {
  debouncer.schedule(key(guildConfigId), () =>
    queue.enqueue(key(guildConfigId), () =>
      updateDashboards(client, guildConfigId).catch((err) =>
        logger.error({ err, guildConfigId }, 'Mise a jour des tableaux KO'),
      ),
    ),
  );
}

/** Mise a jour immediate et serialisee (commande manuelle / demarrage). */
export function updateDashboardsNow(client: Client, guildConfigId: string): Promise<void> {
  return queue.enqueue(key(guildConfigId), () => updateDashboards(client, guildConfigId));
}

/** Vide les rafraichissements en attente (arret gracieux). */
export function flushDashboards(): Promise<void> {
  return debouncer.flush();
}
