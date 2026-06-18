import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { SaleFieldId, SaleModalId } from '../components/ids.js';

function row(input: TextInputBuilder): ActionRowBuilder<TextInputBuilder> {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

/** Modal de validation (§4.6) : quantite validee, note PC, commentaire. */
export function buildValidateModal(reference: string, declaredQuantity: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SaleModalId.VALIDATE)
    .setTitle(`Valider ${reference}`)
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId(SaleFieldId.QUANTITY)
          .setLabel('Quantite validee')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(declaredQuantity)),
      ),
      row(
        new TextInputBuilder()
          .setCustomId(SaleFieldId.NOTE)
          .setLabel('Note de verification (PC in-game)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
      row(
        new TextInputBuilder()
          .setCustomId(SaleFieldId.COMMENT)
          .setLabel('Commentaire (optionnel)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false),
      ),
    );
}

/** Modal de refus (§5.4) : motif obligatoire. */
export function buildRefuseModal(reference: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SaleModalId.REFUSE)
    .setTitle(`Refuser ${reference}`)
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId(SaleFieldId.REASON)
          .setLabel('Motif du refus')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
    );
}

/** Modal de demande de complement (§5.4) : elements manquants. */
export function buildComplementModal(reference: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SaleModalId.COMPLEMENT)
    .setTitle(`Complement ${reference}`)
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId(SaleFieldId.REASON)
          .setLabel('Elements demandes')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
    );
}

/** Modal de correction avant cloture (§5.4) : nouvelle quantite + motif. */
export function buildCorrectModal(reference: string, currentQuantity: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SaleModalId.CORRECT)
    .setTitle(`Corriger ${reference}`)
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId(SaleFieldId.QUANTITY)
          .setLabel('Nouvelle quantite validee')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(currentQuantity)),
      ),
      row(
        new TextInputBuilder()
          .setCustomId(SaleFieldId.REASON)
          .setLabel('Motif de la correction')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
    );
}
