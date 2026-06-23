import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type BaseMessageOptions,
} from 'discord.js';
import { ReviewButtonId } from '../../discord/components/ids.js';
import { formatAverage, stars } from './reviewInput.js';
import type { ReviewStats } from './reviewService.js';

export interface ReviewCardData {
  authorName: string;
  rating: number;
  comment: string;
  employeeName: string | null;
  createdAt: Date;
}

/** Carte d'un avis client, comme un vrai commentaire signe. */
export function buildReviewCard(data: ReviewCardData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setAuthor({ name: data.authorName })
    .setTitle(stars(data.rating))
    .setDescription(data.comment)
    .setTimestamp(data.createdAt);
  if (data.employeeName) {
    embed.addFields({ name: 'Servi par', value: data.employeeName, inline: true });
  }
  return embed;
}

/** Bandeau permanent : note moyenne + bouton "Laisser un avis". */
export function buildReviewBoardMessage(stats: ReviewStats): BaseMessageOptions {
  const embed = new EmbedBuilder().setTitle('⭐ Avis clients — HotzDoggz').setColor(0xf1c40f);
  embed.setDescription(
    stats.count > 0
      ? `Note moyenne : **${formatAverage(stats.average)}/5** ${stars(stats.average)}\n` +
          `**${stats.count}** avis client(s).\n\nUn passage chez HotzDoggz ? Dis-nous tout 👇`
      : 'Aucun avis pour le moment — sois le premier à donner ton avis sur HotzDoggz 👇',
  );

  const button = new ButtonBuilder()
    .setCustomId(ReviewButtonId.OPEN)
    .setLabel('Laisser un avis')
    .setEmoji('📝')
    .setStyle(ButtonStyle.Primary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };
}
