import { type ButtonInteraction } from 'discord.js';
import { ReviewButtonId } from '../components/ids.js';
import { buildReviewModal } from '../modals/reviewModal.js';

/** @returns true si l'interaction a ete prise en charge ici. */
export async function handleReviewButton(interaction: ButtonInteraction): Promise<boolean> {
  if (interaction.customId !== ReviewButtonId.OPEN) return false;
  await interaction.showModal(buildReviewModal());
  return true;
}
