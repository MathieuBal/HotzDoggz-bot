import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { PanelFieldId, PanelModalId } from '../components/ids.js';

function row(input: TextInputBuilder): ActionRowBuilder<TextInputBuilder> {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

const short = (id: string, label: string, required = true, value?: string): TextInputBuilder => {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(required);
  if (value !== undefined) input.setValue(value);
  return input;
};

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

/** Repartition hebdomadaire du benefice. La part Co-dir = le reste (affichee a part). */
export function buildPanelRepartitionModal(cfg: {
  reserveRatePercent: number;
  bonusRatePercent: number;
  directorRatePercent: number;
}): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PanelModalId.REPARTITION)
    .setTitle('Répartition des bénéfices (%)')
    .addComponents(
      row(short(PanelFieldId.RESERVE, 'Réserve de sécurité (% du CA)', true, String(cfg.reserveRatePercent))),
      row(short(PanelFieldId.PRIME, 'Prime meilleur employé (%)', true, String(cfg.bonusRatePercent))),
      row(short(PanelFieldId.DIRECTEUR, 'Part Directeur (%)', true, String(cfg.directorRatePercent))),
    );
}

/** Duree de vie d'un lot de hot dogs (peremption), saisie en jours + heures. */
export function buildPanelPeremptionModal(cfg: { hotdogLifetimeMinutes: number }): ModalBuilder {
  const totalMin = cfg.hotdogLifetimeMinutes;
  const jours = Math.floor(totalMin / (60 * 24));
  const heures = Math.floor((totalMin % (60 * 24)) / 60);
  return new ModalBuilder()
    .setCustomId(PanelModalId.PEREMPTION)
    .setTitle('Péremption d’un hot dog')
    .addComponents(
      row(short(PanelFieldId.JOURS, 'Jours', true, String(jours))),
      row(short(PanelFieldId.HEURES, 'Heures (0-23)', true, String(heures))),
    );
}

/** Seuils du controle d'integrite anti-fraude. */
export function buildPanelFraudeModal(cfg: {
  fraudQuantityThreshold: number;
  fraudBurstCount: number;
  fraudBurstWindowMinutes: number;
}): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PanelModalId.FRAUDE)
    .setTitle('Seuils anti-fraude')
    .addComponents(
      row(short(PanelFieldId.SEUIL_VOLUME, 'Volume max plausible (u)', true, String(cfg.fraudQuantityThreshold))),
      row(short(PanelFieldId.RAFALE_NB, 'Nb de ventes = rafale', true, String(cfg.fraudBurstCount))),
      row(short(PanelFieldId.FENETRE_MIN, 'Fenêtre rafale (minutes)', true, String(cfg.fraudBurstWindowMinutes))),
    );
}

/** Fenetre du rappel de cloture + fuseau horaire du serveur. */
export function buildPanelRappelModal(cfg: {
  closureReminderWeekday: number;
  closureReminderHourStart: number;
  closureReminderHourEnd: number;
  timezone: string;
}): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PanelModalId.RAPPEL)
    .setTitle('Rappel de clôture & fuseau')
    .addComponents(
      row(short(PanelFieldId.JOUR, 'Jour (0=lun … 6=dim)', true, String(cfg.closureReminderWeekday))),
      row(short(PanelFieldId.HEURE_DEBUT, 'Heure début (0-23)', true, String(cfg.closureReminderHourStart))),
      row(short(PanelFieldId.HEURE_FIN, 'Heure fin (exclue, 0-23)', true, String(cfg.closureReminderHourEnd))),
      row(short(PanelFieldId.FUSEAU, 'Fuseau (ex. Europe/Paris)', true, cfg.timezone)),
    );
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
