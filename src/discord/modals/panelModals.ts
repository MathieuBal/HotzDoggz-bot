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

export function buildPanelMenuModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PanelModalId.MENU)
    .setTitle('Menu : ajouter / modifier un prix')
    .addComponents(
      row(short(PanelFieldId.NOM, 'Nom du produit')),
      row(short(PanelFieldId.PRIX, 'Prix de détail ($)')),
    );
}

export function buildPanelPartnerCreateModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PanelModalId.PARTNER_CREATE)
    .setTitle('Créer un partenaire')
    .addComponents(row(short(PanelFieldId.NOM, 'Nom du partenaire')));
}

export function buildPanelPnjPriceModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PanelModalId.PNJ_PRICE)
    .setTitle('Prix de vente PNJ')
    .addComponents(row(short(PanelFieldId.PRIX, 'Nouveau prix PNJ ($/u)')));
}

export function buildPanelOrderCreateModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PanelModalId.ORDER_CREATE)
    .setTitle('Créer une commande client')
    .addComponents(
      row(short(PanelFieldId.CLIENT, 'Client / org')),
      row(short(PanelFieldId.VOLUME, 'Volume (produits)')),
      row(short(PanelFieldId.PRIX, 'Prix total négocié ($)')),
      row(short(PanelFieldId.PARTENAIRE, 'Partenaire (optionnel)', false)),
      row(short(PanelFieldId.ECHEANCE, 'Échéance JJ/MM/AAAA (optionnel)', false)),
    );
}
