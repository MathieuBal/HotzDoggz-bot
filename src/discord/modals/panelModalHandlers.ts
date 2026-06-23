import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import {
  getGuildConfigByGuildId,
  upsertGradeRate,
} from '../../modules/employees/employeeService.js';
import { createOrder } from '../../modules/orders/orderService.js';
import {
  createPartner,
  findActivePartnerByName,
  setPartnerObjective,
} from '../../modules/partners/partnerService.js';
import { PanelFieldId, PanelModalId } from '../components/ids.js';
import { buildConfirmMessage } from '../panel/confirmUi.js';
import { putPending } from '../panel/pending.js';
import { isDirectionMember } from '../permissions.js';

/** Parse une echeance "JJ/MM/AAAA" en Date (null si absente/invalide). */
function parseDeadline(raw: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Les modals salaire/partenaire portent l'id de l'entite en suffixe.
const PREFIXES = Object.values(PanelModalId);
function matchedPrefix(customId: string): string | null {
  return PREFIXES.find((p) => customId === p || customId.startsWith(`${p}:`)) ?? null;
}

/** @returns true si l'interaction a ete prise en charge ici. */
export async function handlePanelModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const base = matchedPrefix(interaction.customId);
  if (!base) return false;

  const ephemeral = MessageFlags.Ephemeral;
  if (!interaction.guild) {
    await interaction.reply({ content: 'Serveur requis.', flags: ephemeral });
    return true;
  }
  const config = await getGuildConfigByGuildId(interaction.guild.id);
  if (!config || !(await isDirectionMember(interaction.guild, interaction.user.id, config))) {
    await interaction.reply({ content: 'Réservé à la direction.', flags: ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: ephemeral });
  const suffix = interaction.customId.slice(base.length + 1); // id encode (salaire/partenaire)

  if (base === PanelModalId.SALAIRE) {
    const montant = Number(interaction.fields.getTextInputValue(PanelFieldId.MONTANT).trim());
    if (!Number.isInteger(montant) || montant < 1) {
      await interaction.editReply('Tarif invalide (entier positif attendu, ex. 165).');
      return true;
    }
    const grade = await prisma.gradeRate.findFirst({
      where: { guildConfigId: config.id, validTo: null, roleId: suffix },
      select: { roleId: true, label: true },
    });
    if (!grade) {
      await interaction.editReply('Grade introuvable (a-t-il été retiré ?). Rouvre le panel.');
      return true;
    }
    await upsertGradeRate(config.id, grade.roleId, grade.label, montant);
    scheduleDashboardUpdate(interaction.client, config.id);
    await interaction.editReply(`✅ Tarif de **${grade.label}** mis à jour : ${montant} $/u.`);
    return true;
  }

  if (base === PanelModalId.PARTENAIRE) {
    const objectif = Number(interaction.fields.getTextInputValue(PanelFieldId.OBJECTIF).trim());
    if (!Number.isInteger(objectif) || objectif < 1) {
      await interaction.editReply('Objectif invalide (entier positif attendu).');
      return true;
    }
    const partner = await prisma.partner.findFirst({
      where: { id: suffix, guildConfigId: config.id },
      select: { name: true },
    });
    if (!partner) {
      await interaction.editReply('Partenaire introuvable. Rouvre le panel.');
      return true;
    }
    const res = await setPartnerObjective(config.id, partner.name, objectif);
    if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
    await interaction.editReply(
      res.ok
        ? `🎯 Objectif hebdomadaire de **${res.data.name}** : ${objectif} u/semaine.`
        : `Échec : ${res.reason}`,
    );
    return true;
  }

  if (base === PanelModalId.MENU) {
    const nom = interaction.fields.getTextInputValue(PanelFieldId.NOM).trim();
    const prix = Number(interaction.fields.getTextInputValue(PanelFieldId.PRIX).trim());
    if (!nom) {
      await interaction.editReply('Le nom du produit est obligatoire.');
      return true;
    }
    if (!Number.isInteger(prix) || prix < 1) {
      await interaction.editReply('Prix invalide (entier positif attendu).');
      return true;
    }
    const existing = await prisma.product.findFirst({
      where: { guildConfigId: config.id, name: { equals: nom, mode: 'insensitive' }, active: true },
      select: { retailPrice: true },
    });
    const oldPrice = existing?.retailPrice ?? null;
    const token = putPending(interaction.user.id, {
      kind: 'menu_price',
      guildConfigId: config.id,
      name: nom,
      price: prix,
      oldPrice,
    });
    const desc =
      oldPrice === null
        ? `Ajouter **${nom}** au menu à **${prix} $** ?`
        : `Changer le prix de **${nom}** : **${oldPrice} $ → ${prix} $** ?`;
    await interaction.editReply(buildConfirmMessage({ title: '🍴 Menu', description: desc, token }));
    return true;
  }

  if (base === PanelModalId.PNJ_PRICE) {
    const prix = Number(interaction.fields.getTextInputValue(PanelFieldId.PRIX).trim());
    if (!Number.isInteger(prix) || prix < 1) {
      await interaction.editReply('Prix invalide (entier positif attendu).');
      return true;
    }
    const oldPrice = config.pnjUnitPrice;
    const token = putPending(interaction.user.id, {
      kind: 'pnj_price',
      guildConfigId: config.id,
      price: prix,
      oldPrice,
    });
    await interaction.editReply(
      buildConfirmMessage({
        title: '💵 Prix de vente PNJ',
        description: `Changer le prix PNJ : **${oldPrice} $ → ${prix} $/u** ?\n_Impacte le CA des futures ventes au PNJ._`,
        token,
      }),
    );
    return true;
  }

  if (base === PanelModalId.PARTNER_CREATE) {
    const nom = interaction.fields.getTextInputValue(PanelFieldId.NOM).trim();
    const res = await createPartner(config.id, nom);
    if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
    await interaction.editReply(
      res.ok ? `🤝 Partenaire **${res.data.name}** créé.` : `Échec : ${res.reason}`,
    );
    return true;
  }

  // ORDER_CREATE
  const clientName = interaction.fields.getTextInputValue(PanelFieldId.CLIENT).trim();
  const volume = Number(interaction.fields.getTextInputValue(PanelFieldId.VOLUME).trim());
  const prix = Number(interaction.fields.getTextInputValue(PanelFieldId.PRIX).trim());
  const partnerName = interaction.fields.getTextInputValue(PanelFieldId.PARTENAIRE).trim();
  const echeance = interaction.fields.getTextInputValue(PanelFieldId.ECHEANCE).trim();
  if (!clientName) {
    await interaction.editReply('Le client est obligatoire.');
    return true;
  }
  if (!Number.isInteger(volume) || volume < 1 || !Number.isInteger(prix) || prix < 1) {
    await interaction.editReply('Volume et prix doivent être des entiers positifs.');
    return true;
  }
  const partner = partnerName ? await findActivePartnerByName(config.id, partnerName) : null;
  if (partnerName && !partner) {
    await interaction.editReply(`Partenaire introuvable : « ${partnerName} ».`);
    return true;
  }
  const res = await createOrder({
    guildConfigId: config.id,
    clientName,
    description: null,
    targetQuantity: volume,
    negotiatedPrice: prix,
    deadline: echeance ? parseDeadline(echeance) : null,
    createdByDiscordId: interaction.user.id,
    partnerId: partner?.id ?? null,
  });
  if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
  await interaction.editReply(
    res.ok
      ? `📦 Commande **${res.data.reference}** créée pour ${clientName}${partner ? ` (🤝 ${partner.name})` : ''}.`
      : `Échec : ${res.reason}`,
  );
  return true;
}
