import type { Client } from 'discord.js';
import type { ClosureSummary } from '../../modules/accounting/closureService.js';
import { prisma } from '../../infrastructure/database/client.js';
import { postClosureReport } from '../../modules/dashboards/dashboardService.js';
import { updateDashboardsNow } from '../../modules/dashboards/scheduler.js';

/**
 * Apres une cloture : publie le bilan final dans comptabilite et reinitialise
 * les tableaux permanents (plus de semaine ouverte). Retourne le libelle de semaine.
 */
export async function finalizeClosure(
  client: Client,
  guildConfigId: string,
  summary: ClosureSummary,
): Promise<string> {
  const week = await prisma.accountingWeek.findUnique({
    where: { id: summary.weekId },
    select: { startAt: true },
  });
  const label = week ? week.startAt.toISOString().slice(0, 10) : '';
  await postClosureReport(client, guildConfigId, summary, label);
  await updateDashboardsNow(client, guildConfigId);
  return label;
}
