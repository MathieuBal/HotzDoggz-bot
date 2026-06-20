import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { ReviewFieldId, ReviewModalId } from '../components/ids.js';

function row(input: TextInputBuilder): ActionRowBuilder<TextInputBuilder> {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

/** Formulaire d'avis client (note, commentaire, employe optionnel). */
export function buildReviewModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(ReviewModalId.SUBMIT)
    .setTitle('Ton avis sur HotzDogz')
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId(ReviewFieldId.RATING)
          .setLabel('Note de 1 à 5')
          .setPlaceholder('5')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(1)
          .setRequired(true),
      ),
      row(
        new TextInputBuilder()
          .setCustomId(ReviewFieldId.COMMENT)
          .setLabel('Ton avis')
          .setPlaceholder('Super accueil, hot dogs parfaits !')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true),
      ),
      row(
        new TextInputBuilder()
          .setCustomId(ReviewFieldId.EMPLOYEE)
          .setLabel('Qui t’a servi ? (optionnel)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(60)
          .setRequired(false),
      ),
    );
}
