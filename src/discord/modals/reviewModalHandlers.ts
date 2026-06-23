import { type ModalSubmitInteraction, MessageFlags } from 'discord.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { buildReviewCard } from '../../modules/reviews/embeds.js';
import { parseRating } from '../../modules/reviews/reviewInput.js';
import {
  attachReviewMessage,
  createReview,
  matchEmployeeByName,
} from '../../modules/reviews/reviewService.js';
import { updateReviewBoard } from '../../modules/reviews/reviewBoardService.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { ReviewFieldId, ReviewModalId } from '../components/ids.js';

/** @returns true si l'interaction a ete prise en charge ici. */
export async function handleReviewModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId !== ReviewModalId.SUBMIT) return false;

  const ephemeral = MessageFlags.Ephemeral;
  if (!interaction.guild) {
    await interaction.reply({ content: 'Serveur requis.', flags: ephemeral });
    return true;
  }
  const config = await getGuildConfigByGuildId(interaction.guild.id);
  if (!config?.channelReviews) {
    await interaction.reply({ content: 'Les avis ne sont pas configurés.', flags: ephemeral });
    return true;
  }

  const rating = parseRating(interaction.fields.getTextInputValue(ReviewFieldId.RATING));
  if (rating === null) {
    await interaction.reply({
      content: 'La note doit être un chiffre de 1 à 5.',
      flags: ephemeral,
    });
    return true;
  }
  const comment = interaction.fields.getTextInputValue(ReviewFieldId.COMMENT).trim();
  if (!comment) {
    await interaction.reply({ content: 'Ton avis ne peut pas être vide.', flags: ephemeral });
    return true;
  }
  const rawEmployee = interaction.fields.getTextInputValue(ReviewFieldId.EMPLOYEE).trim();
  const matched = rawEmployee ? await matchEmployeeByName(config.id, rawEmployee) : null;
  const employeeName = matched?.nomRP ?? (rawEmployee || null);

  await interaction.deferReply({ flags: ephemeral });

  const res = await createReview({
    guildConfigId: config.id,
    authorDiscordId: interaction.user.id,
    authorName: interaction.user.displayName,
    rating,
    comment,
    employeeName,
    employeeId: matched?.id ?? null,
  });
  if (!res.ok) {
    await interaction.editReply(res.reason);
    return true;
  }

  // Poste la carte publique dans le salon, puis remonte le bandeau en dessous.
  const channel = await interaction.client.channels.fetch(config.channelReviews).catch(() => null);
  if (channel && channel.isTextBased() && 'send' in channel) {
    try {
      const card = await channel.send({
        embeds: [
          buildReviewCard({
            authorName: interaction.user.displayName,
            rating,
            comment,
            employeeName,
            createdAt: res.data.createdAt,
          }),
        ],
      });
      await attachReviewMessage(res.data.id, card.id);
    } catch (err) {
      logger.warn({ err }, 'Publication de la carte d’avis KO');
    }
  }
  // Collant : on repose le bandeau sous la nouvelle carte d'avis.
  await updateReviewBoard(interaction.client, config.id, { sticky: true }).catch(() => undefined);

  await interaction.editReply('Merci pour ton avis ! 🌭');
  return true;
}
