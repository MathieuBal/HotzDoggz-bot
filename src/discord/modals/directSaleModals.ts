import type { DirectSaleLine } from '@prisma/client';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { DirectSaleFieldId, DirectSaleModalId } from '../components/ids.js';

function row(input: TextInputBuilder): ActionRowBuilder<TextInputBuilder> {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

/** Modal de validation : une quantite par ligne (pre-remplie) + note. */
export function buildDirectValidateModal(
  reference: string,
  lines: readonly DirectSaleLine[],
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(DirectSaleModalId.VALIDATE)
    .setTitle(`Valider ${reference}`.slice(0, 45));
  for (const l of lines) {
    modal.addComponents(
      row(
        new TextInputBuilder()
          .setCustomId(l.id) // la cle = id de ligne, relue a la soumission
          .setLabel(`${l.productName} (qté)`.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setValue(String(l.declaredQuantity))
          .setRequired(true),
      ),
    );
  }
  modal.addComponents(
    row(
      new TextInputBuilder()
        .setCustomId(DirectSaleFieldId.NOTE)
        .setLabel('Note de vérification (PC in-game)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true),
    ),
  );
  return modal;
}

/** Modal de refus : motif obligatoire. */
export function buildDirectRefuseModal(reference: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(DirectSaleModalId.REFUSE)
    .setTitle(`Refuser ${reference}`.slice(0, 45))
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId(DirectSaleFieldId.REASON)
          .setLabel('Motif du refus')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
    );
}

/** Modal de demande de complement : elements demandes obligatoires. */
export function buildDirectComplementModal(reference: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(DirectSaleModalId.COMPLEMENT)
    .setTitle(`Complément ${reference}`.slice(0, 45))
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId(DirectSaleFieldId.REASON)
          .setLabel('Éléments à compléter')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
    );
}
