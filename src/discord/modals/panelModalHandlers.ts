import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import {
  getGuildConfigByGuildId,
  upsertGradeRate,
} from '../../modules/employees/employeeService.js';
import { deactivateProduct, upsertProduct } from '../../modules/products/productService.js';
import { createOrder } from '../../modules/orders/orderService.js';
import {
  createPartner,
  findActivePartnerByName,
  setPartnerObjective,
} from '../../modules/partners/partnerService.js';
import { PanelFieldId, PanelModalId } from '../components/ids.js';
import { isDirectionMember } from '../permissions.js';

/** Parse une echeance "JJ/MM/AAAA" en Date (null si absente/invalide). */
function parseDeadline(raw: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const KNOWN = new Set<string>(Object.values(PanelModalId));

/** @returns true si l'interaction a ete prise en charge ici. */
export async function handlePanelModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!KNOWN.has(interaction.customId)) return false;

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

  if (interaction.customId === PanelModalId.SALAIRE) {
    const gradeLabel = interaction.fields.getTextInputValue(PanelFieldId.GRADE).trim();
    const montant = Number(interaction.fields.getTextInputValue(PanelFieldId.MONTANT).trim());
    if (!Number.isInteger(montant) || montant < 1) {
      await interaction.editReply('Tarif invalide (entier positif attendu).');
      return true;
    }
    const grade = await prisma.gradeRate.findFirst({
      where: {
        guildConfigId: config.id,
        validTo: null,
        label: { equals: gradeLabel, mode: 'insensitive' },
      },
    });
    if (!grade) {
      const known = await prisma.gradeRate.findMany({
        where: { guildConfigId: config.id, validTo: null },
        select: { label: true },
      });
      await interaction.editReply(
        `Grade introuvable. Grades connus : ${known.map((g) => g.label).join(', ') || '—'}.`,
      );
      return true;
    }
    await upsertGradeRate(config.id, grade.roleId, grade.label, montant);
    scheduleDashboardUpdate(interaction.client, config.id);
    await interaction.editReply(`✅ Tarif de **${grade.label}** mis à jour : ${montant} $/u.`);
    return true;
  }

  if (interaction.customId === PanelModalId.MENU) {
    const nom = interaction.fields.getTextInputValue(PanelFieldId.NOM).trim();
    const prix = Number(interaction.fields.getTextInputValue(PanelFieldId.PRIX).trim());
    if (!Number.isInteger(prix) || prix < 1) {
      await interaction.editReply('Prix invalide (entier positif attendu).');
      return true;
    }
    const res = await upsertProduct(config.id, nom, prix);
    await interaction.editReply(
      res.ok ? `✅ **${res.data.name}** au menu à ${prix} $.` : `Échec : ${res.reason}`,
    );
    return true;
  }

  if (interaction.customId === PanelModalId.MENU_REMOVE) {
    const nom = interaction.fields.getTextInputValue(PanelFieldId.NOM).trim();
    const res = await deactivateProduct(config.id, nom);
    await interaction.editReply(
      res.ok ? `🗑️ **${res.data.name}** retiré du menu.` : `Échec : ${res.reason}`,
    );
    return true;
  }

  if (interaction.customId === PanelModalId.PNJ_PRICE) {
    const prix = Number(interaction.fields.getTextInputValue(PanelFieldId.PRIX).trim());
    if (!Number.isInteger(prix) || prix < 1) {
      await interaction.editReply('Prix invalide (entier positif attendu).');
      return true;
    }
    await prisma.guildConfig.update({ where: { id: config.id }, data: { pnjUnitPrice: prix } });
    await writeAudit(prisma, {
      guildConfigId: config.id,
      action: 'PNJ_PRICE_SET',
      authorDiscordId: interaction.user.id,
      after: { pnjUnitPrice: prix },
    });
    scheduleDashboardUpdate(interaction.client, config.id);
    await interaction.editReply(`💵 Prix de vente PNJ mis à jour : ${prix} $/u.`);
    return true;
  }

  if (interaction.customId === PanelModalId.PARTNER_CREATE) {
    const nom = interaction.fields.getTextInputValue(PanelFieldId.NOM).trim();
    const res = await createPartner(config.id, nom);
    if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
    await interaction.editReply(
      res.ok ? `🤝 Partenaire **${res.data.name}** créé.` : `Échec : ${res.reason}`,
    );
    return true;
  }

  if (interaction.customId === PanelModalId.ORDER_CREATE) {
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

  // PARTENAIRE (objectif)
  const nom = interaction.fields.getTextInputValue(PanelFieldId.NOM).trim();
  const objectif = Number(interaction.fields.getTextInputValue(PanelFieldId.OBJECTIF).trim());
  if (!Number.isInteger(objectif) || objectif < 1) {
    await interaction.editReply('Objectif invalide (entier positif attendu).');
    return true;
  }
  const res = await setPartnerObjective(config.id, nom, objectif);
  if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
  await interaction.editReply(
    res.ok
      ? `🎯 Objectif hebdomadaire de **${res.data.name}** : ${objectif} u/semaine.`
      : `Échec : ${res.reason}`,
  );
  return true;
}
