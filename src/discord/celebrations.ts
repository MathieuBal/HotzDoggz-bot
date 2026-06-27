import { type Client, EmbedBuilder } from 'discord.js';
import { withRetry } from '../infrastructure/async/retry.js';
import { prisma } from '../infrastructure/database/client.js';
import { logger } from '../infrastructure/logging/logger.js';

/**
 * Celebrations automatiques (boucle de feedback joueur). Le bot enregistre tout
 * mais ne renvoyait presque rien aux joueurs : ces annonces festives, postees
 * dans le salon employe (croissance), rendent visibles les reussites. Best-effort
 * et non bloquant : un echec d'annonce ne casse jamais l'action metier.
 */

const nf = new Intl.NumberFormat('fr-FR');
const MEDALS = ['🥇', '🥈', '🥉'];

export interface Contributor {
  nomRP: string;
  quantity: number;
}

/** Remerciement des producteurs, tries par volume decroissant (pur, testable). */
export function formatContributors(contributors: readonly Contributor[]): string {
  const ordered = [...contributors]
    .filter((c) => c.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity);
  if (ordered.length === 0) return '_Aucune contribution enregistrée._';
  return ordered
    .map((c, i) => `${MEDALS[i] ?? '•'} **${c.nomRP}** — ${nf.format(c.quantity)} u`)
    .join('\n');
}

/** Embed festif de commande livree (pur, testable). */
export function buildOrderDeliveredCelebration(
  reference: string,
  clientName: string,
  contributors: readonly Contributor[],
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`📦 Commande ${reference} livrée ! 🎉`)
    .setColor(0xf1c40f)
    .setDescription(
      `Livrée à **${clientName}**. Bravo à l’équipe de production :\n\n${formatContributors(contributors)}`,
    )
    .setFooter({ text: 'Le travail d’équipe paie. On enchaîne ! 🌭' })
    .setTimestamp(new Date());
}

/**
 * Publie une celebration dans le salon employe (croissance), avec repli sur le
 * tableau hebdo. Silencieux si aucun salon employe n'est configure.
 */
export async function postCelebration(
  client: Client,
  guildConfigId: string,
  embed: EmbedBuilder,
): Promise<void> {
  const config = await prisma.guildConfig.findUnique({
    where: { id: guildConfigId },
    select: { channelCompanyBoard: true, channelWeeklyBoard: true },
  });
  const channelId = config?.channelCompanyBoard ?? config?.channelWeeklyBoard;
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased() && 'send' in channel) {
      await withRetry(async () => channel.send({ embeds: [embed] }));
    }
  } catch (err) {
    logger.warn({ err, channelId }, 'Publication d’une célébration KO');
  }
}
