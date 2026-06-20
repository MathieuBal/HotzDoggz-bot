import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { PanelFieldId, PanelModalId } from '../components/ids.js';

function row(input: TextInputBuilder): ActionRowBuilder<TextInputBuilder> {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

const short = (id: string, label: string, required = true): TextInputBuilder =>
  new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(required);

export function buildPanelSalaireModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PanelModalId.SALAIRE)
    .setTitle('Modifier un salaire')
    .addComponents(
      row(short(PanelFieldId.GRADE, 'Grade (ex. Novice, Chef d’équipe)')),
      row(short(PanelFieldId.MONTANT, 'Nouveau tarif ($/u)')),
    );
}

export function buildPanelMenuModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PanelModalId.MENU)
    .setTitle('Menu : ajouter / modifier un prix')
    .addComponents(
      row(short(PanelFieldId.NOM, 'Nom du produit')),
      row(short(PanelFieldId.PRIX, 'Prix de détail ($)')),
    );
}

export function buildPanelPartenaireModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PanelModalId.PARTENAIRE)
    .setTitle('Objectif hebdomadaire partenaire')
    .addComponents(
      row(short(PanelFieldId.NOM, 'Nom du partenaire')),
      row(short(PanelFieldId.OBJECTIF, 'Objectif (produits / semaine)')),
    );
}
