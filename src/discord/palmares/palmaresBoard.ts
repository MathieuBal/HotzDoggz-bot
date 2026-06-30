import {
  EmbedBuilder,
  type Client,
  type TextBasedChannel,
} from 'discord.js';
import { withRetry } from '../../infrastructure/async/retry.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { getTopSellers } from '../../modules/accounting/leaderboardService.js';
import { UNIT_BADGES } from '../../modules/badges/registry.js';

/**
 * Tableau « Palmarès » permanent : classement des meilleurs vendeurs avec leur
 * emoji de prestige (plus haut palier de production). Edite toujours le meme
 * message (msgPalmares), comme les autres dashboards.
 */

const nf = new Intl.NumberFormat('fr-FR');
const MEDALS = ['🥇', '🥈', '🥉'];

/** Emoji du plus haut palier de production possede (parmi un set de cles). */
function prestigeEmoji(keys: ReadonlySet<string>): string {
  let emoji = '';
  for (const b of UNIT_BADGES) if (keys.has(b.key)) emoji = b.emoji; // UNIT_BADGES trie croissant
  return emoji;
}

async function buildPalmaresEmbed(guildConfigId: string): Promise<EmbedBuilder> {
  const top = await getTopSellers(guildConfigId, 10);
  if (top.length === 0) {
    return new EmbedBuilder()
      .setTitle('🏆 Palmarès HotzDoggz')
      .setColor(0xf1c40f)
      .setDescription('_Aucune vente validée pour le moment. À vos pinces ! 🌭_')
      .setTimestamp(new Date());
  }

  // Badges de prestige de tous les classes, en une requete.
  const badges = await prisma.employeeBadge.findMany({
    where: { employeeId: { in: top.map((t) => t.employeeId) } },
    select: { employeeId: true, badgeKey: true },
  });
  const keysByEmployee = new Map<string, Set<string>>();
  for (const b of badges) {
    const set = keysByEmployee.get(b.employeeId) ?? new Set<string>();
    set.add(b.badgeKey);
    keysByEmployee.set(b.employeeId, set);
  }

  const lines = top.map((t, i) => {
    const rank = MEDALS[i] ?? `**${i + 1}.**`;
    const prestige = prestigeEmoji(keysByEmployee.get(t.employeeId) ?? new Set());
    const tag = prestige ? `${prestige} ` : '';
    return `${rank} ${tag}**${t.nomRP}** — ${nf.format(t.units)} u · ${nf.format(t.revenue)} $`;
  });

  return new EmbedBuilder()
    .setTitle('🏆 Palmarès HotzDoggz — meilleurs vendeurs')
    .setColor(0xf1c40f)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Ventes PNJ validées (cumul). L’emoji = ton plus haut palier de prestige. 🌭' })
    .setTimestamp(new Date());
}

/** Publie / met a jour le tableau palmares permanent dans son salon dedie. */
export async function publishPalmaresBoard(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelPalmares) return;

  const channel = await client.channels.fetch(config.channelPalmares).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    logger.warn({ channelId: config.channelPalmares }, 'Salon palmarès introuvable ou non textuel');
    return;
  }
  const embed = await buildPalmaresEmbed(guildConfigId);

  if (config.msgPalmares) {
    try {
      const msg = await (channel as TextBasedChannel).messages.fetch(config.msgPalmares);
      await withRetry(async () => msg.edit({ embeds: [embed] }));
      return;
    } catch {
      logger.warn({ msgPalmares: config.msgPalmares }, 'Message palmarès absent — recreation');
    }
  }
  const created = await withRetry(async () => channel.send({ embeds: [embed] }));
  await prisma.guildConfig.update({
    where: { id: guildConfigId },
    data: { msgPalmares: created.id },
  });
}
