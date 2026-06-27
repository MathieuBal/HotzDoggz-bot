import { EmbedBuilder, type Client } from 'discord.js';
import type { ClosureSummary } from '../../modules/accounting/closureService.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { openWeek } from '../../modules/accounting/accountingService.js';
import { buildWeekCelebration } from '../../modules/dashboards/embeds.js';
import { formatLeaderboard, getTopSellers } from '../../modules/accounting/leaderboardService.js';
import { postClosureReport } from '../../modules/dashboards/dashboardService.js';
import { updateDashboardsNow } from '../../modules/dashboards/scheduler.js';
import { sendPayslips } from '../../modules/notifications/proactive.js';

/** Poste le recap festif dans un salon visible des employes (sans la partie direction). */
async function postCelebration(
  client: Client,
  config: { channelCompanyBoard: string | null; channelWeeklyBoard: string | null },
  embed: EmbedBuilder,
): Promise<void> {
  const channelId = config.channelCompanyBoard ?? config.channelWeeklyBoard;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased() && 'send' in channel) {
    await channel.send({ embeds: [embed] }).catch((err) => logger.warn({ err }, 'Celebration KO'));
  }
}

/**
 * Apres une cloture : publie le bilan final dans comptabilite, envoie les fiches
 * de paie, ENCHAINE sur la semaine suivante, rafraichit les tableaux et celebre
 * la semaine ecoulee aupres des employes. Retourne le libelle de semaine.
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
  const config = await prisma.guildConfig.findUnique({
    where: { id: guildConfigId },
    select: { guildId: true, timezone: true, channelCompanyBoard: true, channelWeeklyBoard: true },
  });

  await postClosureReport(client, guildConfigId, summary, label);
  // Fiche de paie individuelle en DM a chaque employe (CDC §6.7).
  await sendPayslips(client, guildConfigId).catch(() => undefined);

  // Enchaine automatiquement sur la semaine suivante (le verrou est libere a la cloture).
  if (config) {
    const opened = await openWeek(guildConfigId, config.guildId, config.timezone);
    if (!opened.ok) {
      logger.warn({ guildConfigId, reason: opened.reason }, 'Ouverture auto de la semaine suivante KO');
    }
  }

  // Tableaux a jour (nouvelle semaine ouverte + paies de la semaine close).
  await updateDashboardsNow(client, guildConfigId);

  // Celebration cote employes.
  if (config) {
    await postCelebration(client, config, buildWeekCelebration(summary, label));

    // Podium « vendeurs de la semaine » : reconnaissance hebdo automatique.
    const podium = await getTopSellers(guildConfigId, 3, summary.weekId);
    if (podium.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle(`🏆 Vendeurs de la semaine du ${label}`)
        .setColor(0xf1c40f)
        .setDescription(formatLeaderboard(podium))
        .setFooter({ text: 'Bravo à eux ! Nouvelle semaine, à toi de jouer. 🌭' })
        .setTimestamp(new Date());
      await postCelebration(client, config, embed);
    }
  }

  return label;
}
