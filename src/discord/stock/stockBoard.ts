import { EmbedBuilder, type Client, type TextBasedChannel } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { formatCountdown } from '../../modules/stock/perishable.js';
import { getStockState } from '../../modules/stock/stockService.js';

const nf = new Intl.NumberFormat('fr-FR');

/** Embed d'etat du stock (saucisses par vehicule + lots de hot dogs perissables). */
export async function buildStockEmbed(guildConfigId: string): Promise<EmbedBuilder> {
  const state = await getStockState(guildConfigId);
  const now = new Date();

  const embed = new EmbedBuilder()
    .setTitle('📦 Stock — saucisses & hot dogs')
    .setColor(0xe67e22)
    .setTimestamp(now);

  const vehicles =
    state.vehicles.length === 0
      ? '_Aucun véhicule (`/vehicule ajouter`)._'
      : state.vehicles
          .map((v) => `🚚 **${v.make} ${v.plate}**${v.name ? ` (${v.name})` : ''} — **${nf.format(v.saucisses)}** saucisse(s)`)
          .join('\n');
  embed.addFields({
    name: `🥩 Saucisses (non périssables) — total ${nf.format(state.totalSaucisses)}`,
    value: vehicles,
  });

  if (state.batches.length === 0) {
    embed.addFields({
      name: '🌭 Hot dogs prêts',
      value: '_Aucun lot. Transforme des saucisses avant un service : `/stock transformer`._',
    });
  } else {
    // Les plus proches de la peremption en premier (deja tries par expiresAt).
    const lines = state.batches
      .slice(0, 12)
      .map((b) => {
        const cd = formatCountdown(b.expiresAt, now);
        const warn = b.expiresAt.getTime() - now.getTime() < 24 * 3600 * 1000 ? ' ⚠️' : '';
        return `• **${nf.format(b.remaining)}** hot dog(s) — périme dans **${cd}**${warn}`;
      })
      .join('\n');
    embed.addFields({
      name: `🌭 Hot dogs prêts (périssables) — total ${nf.format(state.totalHotdogs)}`,
      value: lines,
    });
  }

  return embed.setFooter({
    text: 'Saucisses = réserve · transforme juste avant le besoin (hot dogs : 6j17h)',
  });
}

/** Publie / met a jour le tableau de stock dans son salon dedie. */
export async function publishStockBoard(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelStock) return;

  const channel = await client.channels.fetch(config.channelStock).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    logger.warn({ channelId: config.channelStock }, 'Salon stock introuvable');
    return;
  }
  const embed = await buildStockEmbed(guildConfigId);

  if (config.msgStockBoard) {
    try {
      const msg = await (channel as TextBasedChannel).messages.fetch(config.msgStockBoard);
      await msg.edit({ embeds: [embed] });
      return;
    } catch {
      /* message supprime -> on recree */
    }
  }
  const created = await channel.send({ embeds: [embed] });
  await prisma.guildConfig.update({
    where: { id: guildConfigId },
    data: { msgStockBoard: created.id },
  });
}
