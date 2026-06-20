import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import {
  getGuildConfigByGuildId,
  upsertGradeRate,
} from '../../modules/employees/employeeService.js';
import { upsertProduct } from '../../modules/products/productService.js';
import { setPartnerObjective } from '../../modules/partners/partnerService.js';
import { PanelFieldId, PanelModalId } from '../components/ids.js';
import { isDirectionMember } from '../permissions.js';

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

  // PARTENAIRE
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
