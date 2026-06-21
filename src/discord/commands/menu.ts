import {
  AttachmentType,
} from '@prisma/client';
import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import {
  findActiveProductByName,
  listActiveProducts,
  setProductImage,
} from '../../modules/products/productService.js';
import { downloadAndStore, isImageAttachment } from '../../modules/sales/attachments.js';
import { buildConfirmMessage } from '../panel/confirmUi.js';
import { publishMenuBoard } from '../menu/menuBoard.js';
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
    .addSubcommand((s) =>
      s
        .setName('image')
        .setDescription('Définir la photo (et l’accroche) d’un produit pour le menu public')
        .addStringOption((o) =>
          o
            .setName('nom')
            .setDescription('Produit')
            .setAutocomplete(true)
            .setRequired(true),
        )
        .addAttachmentOption((o) =>
          o.setName('image').setDescription('Photo du produit').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('accroche').setDescription('Petite description (optionnel)').setRequired(false),
        ),
    )
    .addSubcommand((s) => s.setName('voir').setDescription('Afficher le menu actuel'))
    .toJSON(),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (!interaction.inGuild()) return void interaction.respond([]);
    const config = await getGuildConfigByGuildId(interaction.guildId);
    if (!config) return void interaction.respond([]);
    const focused = interaction.options.getFocused().toString().toLowerCase();
    const products = await listActiveProducts(config.id);
    await interaction.respond(
      products
        .filter((p) => p.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((p) => ({ name: `${p.name} — ${p.retailPrice} $`, value: p.name })),
    );
  },

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

    if (sub === 'image') {
      const nom = interaction.options.getString('nom', true).trim();
      const image = interaction.options.getAttachment('image', true);
      const accroche = interaction.options.getString('accroche')?.trim() || null;
      if (!isImageAttachment(image)) {
        await interaction.editReply('Le fichier doit être une image.');
        return;
      }
      const product = await findActiveProductByName(config.id, nom);
      if (!product) {
        await interaction.editReply(`Produit introuvable au menu : « ${nom} ».`);
        return;
      }
      let stored;
      try {
        stored = await downloadAndStore({
          guildId: interaction.guild.id,
          threadId: `menu-${product.id}`,
          type: AttachmentType.COFFRE_PLEIN, // emplacement de stockage (photo produit)
          messageId: interaction.id,
          attachment: image,
        });
      } catch {
        await interaction.editReply('Échec de la copie de l’image. Réessaie.');
        return;
      }
      const res = await setProductImage(
        config.id,
        product.name,
        stored.storageKey,
        stored.fileName,
        accroche,
      );
      if (!res.ok) {
        await interaction.editReply(`Échec : ${res.reason}`);
        return;
      }
      await publishMenuBoard(interaction.client, config.id).catch(() => undefined);
      await interaction.editReply(
        `✅ Photo de **${res.data.name}** enregistrée. Le menu public est à jour.` +
          (config.channelMenuBoard ? '' : '\n⚠️ Aucun salon menu lié : `/config salons menu:#…`.'),
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
