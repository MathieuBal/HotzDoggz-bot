import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { listActivePartners } from '../../modules/partners/partnerService.js';
import { listActiveProducts } from '../../modules/products/productService.js';
import { PanelFieldId, PanelModalId, PanelPickId } from '../components/ids.js';
import { isDirectionMember } from '../permissions.js';
import { buildConfirmMessage } from './confirmUi.js';
import { putPending } from './pending.js';

const nf = new Intl.NumberFormat('fr-FR');

function selectRow(menu: StringSelectMenuBuilder): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

/** Selecteur de grade (salaire) — null si aucun grade. */
export async function buildGradePicker(
  guildConfigId: string,
): Promise<ActionRowBuilder<StringSelectMenuBuilder> | null> {
  const grades = await prisma.gradeRate.findMany({
    where: { guildConfigId, validTo: null },
    select: { roleId: true, label: true, ratePerUnit: true },
    orderBy: { ratePerUnit: 'desc' },
  });
  if (grades.length === 0) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(PanelPickId.SALAIRE)
    .setPlaceholder('Choisis le grade à modifier…')
    .addOptions(
      grades.slice(0, 25).map((g) => ({
        label: g.label,
        description: `${nf.format(g.ratePerUnit)} $/u actuellement`,
        value: g.roleId,
      })),
    );
  return selectRow(menu);
}

/** Selecteur de partenaire (objectif) — null si aucun. */
export async function buildPartnerPicker(
  guildConfigId: string,
): Promise<ActionRowBuilder<StringSelectMenuBuilder> | null> {
  const partners = await listActivePartners(guildConfigId);
  if (partners.length === 0) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(PanelPickId.PARTENAIRE)
    .setPlaceholder('Choisis le partenaire…')
    .addOptions(partners.slice(0, 25).map((p) => ({ label: p.name, value: p.id })));
  return selectRow(menu);
}

/** Selecteur de produit a retirer — null si aucun. */
export async function buildProductRemovePicker(
  guildConfigId: string,
): Promise<ActionRowBuilder<StringSelectMenuBuilder> | null> {
  const products = await listActiveProducts(guildConfigId);
  if (products.length === 0) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(PanelPickId.MENU_RETIRER)
    .setPlaceholder('Choisis le produit à retirer…')
    .addOptions(
      products.slice(0, 25).map((p) => ({
        label: p.name,
        description: `${nf.format(p.retailPrice)} $`,
        value: p.id,
      })),
    );
  return selectRow(menu);
}

const PICK_IDS = new Set<string>(Object.values(PanelPickId));

/** Traite la selection d'entite (2e niveau du panel). @returns true si gere ici. */
export async function handlePanelPick(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (!PICK_IDS.has(interaction.customId)) return false;

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
  const value = interaction.values[0];
  if (!value) {
    await interaction.reply({ content: 'Sélection vide.', flags: ephemeral });
    return true;
  }

  if (interaction.customId === PanelPickId.SALAIRE) {
    const grade = await prisma.gradeRate.findFirst({
      where: { guildConfigId: config.id, validTo: null, roleId: value },
      select: { label: true },
    });
    const modal = new ModalBuilder()
      .setCustomId(`${PanelModalId.SALAIRE}:${value}`)
      .setTitle(`Salaire — ${grade?.label ?? 'grade'}`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(PanelFieldId.MONTANT)
            .setLabel('Nouveau tarif ($/u, ex. 165)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.customId === PanelPickId.PARTENAIRE) {
    const modal = new ModalBuilder()
      .setCustomId(`${PanelModalId.PARTENAIRE}:${value}`)
      .setTitle('Objectif hebdomadaire')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(PanelFieldId.OBJECTIF)
            .setLabel('Objectif (produits / semaine)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal);
    return true;
  }

  // MENU_RETIRER : on confirme avant de retirer.
  const product = await prisma.product.findFirst({
    where: { id: value, guildConfigId: config.id },
    select: { id: true, name: true },
  });
  if (!product) {
    await interaction.update({ content: 'Produit introuvable.', embeds: [], components: [] });
    return true;
  }
  const token = putPending(interaction.user.id, {
    kind: 'menu_remove',
    guildConfigId: config.id,
    productId: product.id,
    name: product.name,
  });
  await interaction.update(
    buildConfirmMessage({
      title: '🗑️ Retirer un produit',
      description: `Retirer **${product.name}** du menu ? Il ne sera plus proposé aux ventes (l'historique reste intact).`,
      token,
      confirmLabel: 'Retirer',
      danger: true,
    }),
  );
  return true;
}
