import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import { prisma } from '../../infrastructure/database/client.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import {
  deactivateProduct,
  listActiveProducts,
  upsertProduct,
} from '../../modules/products/productService.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

const nf = new Intl.NumberFormat('fr-FR');
const money = (n: number): string => `${nf.format(n)} $`;

/**
 * Gestion du menu des produits vendus en main en main (direction). Le prix de
 * detail est libre et modifiable ; chaque vente fige le prix du moment.
 */
export const menuCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('menu')
    .setDescription('Gérer le menu des produits (direction)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('ajouter')
        .setDescription('Ajouter un produit ou mettre à jour son prix')
        .addStringOption((o) => o.setName('nom').setDescription('Nom du produit').setRequired(true))
        .addIntegerOption((o) =>
          o.setName('prix').setDescription('Prix de détail ($)').setMinValue(1).setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('retirer')
        .setDescription('Retirer un produit du menu')
        .addStringOption((o) =>
          o.setName('nom').setDescription('Nom du produit').setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName('voir').setDescription('Afficher le menu actuel'))
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({ content: 'Serveur requis.', flags: MessageFlags.Ephemeral });
      return;
    }
    const config = await getGuildConfigByGuildId(interaction.guild.id);
    if (!config) {
      await interaction.reply({ content: 'Configuration absente.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!(await isDirection(interaction, config))) {
      await interaction.reply({
        content: 'Réservé à la direction.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();

    if (sub === 'ajouter') {
      const nom = interaction.options.getString('nom', true);
      const prix = interaction.options.getInteger('prix', true);
      const res = await upsertProduct(config.id, nom, prix);
      if (!res.ok) {
        await interaction.editReply(`Échec : ${res.reason}`);
        return;
      }
      await writeAudit(prisma, {
        guildConfigId: config.id,
        action: 'PRODUCT_UPSERT',
        authorDiscordId: interaction.user.id,
        entityType: 'Product',
        entityId: res.data.id,
        after: { name: res.data.name, retailPrice: res.data.retailPrice },
      });
      await interaction.editReply(
        `✅ **${res.data.name}** au menu à ${money(res.data.retailPrice)}.`,
      );
      return;
    }

    if (sub === 'retirer') {
      const nom = interaction.options.getString('nom', true);
      const res = await deactivateProduct(config.id, nom);
      if (!res.ok) {
        await interaction.editReply(`Échec : ${res.reason}`);
        return;
      }
      await writeAudit(prisma, {
        guildConfigId: config.id,
        action: 'PRODUCT_DEACTIVATED',
        authorDiscordId: interaction.user.id,
        entityType: 'Product',
        entityId: res.data.id,
      });
      await interaction.editReply(`🚫 **${res.data.name}** retiré du menu.`);
      return;
    }

    // voir
    const products = await listActiveProducts(config.id);
    const lines =
      products.length > 0
        ? products.map((p) => `• **${p.name}** — ${money(p.retailPrice)}`).join('\n')
        : '_Aucun produit. Ajoute-en avec_ `/menu ajouter`.';
    await interaction.editReply({
      embeds: [
        new EmbedBuilder().setTitle('🍴 Menu HotzDogz').setColor(0xff7a00).setDescription(lines),
      ],
    });
  },
};
