import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { findActiveProductByName, listActiveProducts } from '../../modules/products/productService.js';
import { buildConfirmMessage } from '../panel/confirmUi.js';
import { putPending } from '../panel/pending.js';
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
      const nom = interaction.options.getString('nom', true).trim();
      const prix = interaction.options.getInteger('prix', true);
      if (!nom) {
        await interaction.editReply('Le nom du produit est obligatoire.');
        return;
      }
      const existing = await findActiveProductByName(config.id, nom);
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
          ? `Ajouter **${nom}** au menu à **${money(prix)}** ?`
          : `Changer le prix de **${nom}** : **${money(oldPrice)} → ${money(prix)}** ?`;
      await interaction.editReply(buildConfirmMessage({ title: '🍴 Menu', description: desc, token }));
      return;
    }

    if (sub === 'retirer') {
      const nom = interaction.options.getString('nom', true).trim();
      const existing = await findActiveProductByName(config.id, nom);
      if (!existing) {
        await interaction.editReply(`Produit introuvable au menu : « ${nom} ».`);
        return;
      }
      const token = putPending(interaction.user.id, {
        kind: 'menu_remove',
        guildConfigId: config.id,
        productId: existing.id,
        name: existing.name,
      });
      await interaction.editReply(
        buildConfirmMessage({
          title: '🗑️ Retirer un produit',
          description: `Retirer **${existing.name}** du menu ? Il ne sera plus proposé aux ventes (l'historique reste intact).`,
          token,
          confirmLabel: 'Retirer',
          danger: true,
        }),
      );
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
