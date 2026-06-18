import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { FORCE_CLOSE_WORD, WeekFieldId, WeekModalId } from '../components/ids.js';

/** Modal de cloture forcee (CDC §6.6) : motif + double confirmation. */
export function buildForceCloseModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(WeekModalId.FORCE_CLOSE)
    .setTitle('Cloture forcee')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(WeekFieldId.REASON)
          .setLabel('Motif (obligatoire)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(WeekFieldId.CONFIRM)
          .setLabel(`Tape ${FORCE_CLOSE_WORD} pour confirmer`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
}
