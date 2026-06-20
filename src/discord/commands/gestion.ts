import { ClientOrderStatus, SaleStatus } from '@prisma/client';
import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../infrastructure/database/client.js';
import {
  adminCancelOrder,
  adminCancelSale,
  reopenLastClosedWeek,
} from '../../modules/accounting/adminService.js';
import { getOpenWeek } from '../../modules/accounting/accountingService.js';
import { computeDirectSaleTotals } from '../../modules/directSales/directSaleReference.js';
import { updateDashboardsNow } from '../../modules/dashboards/scheduler.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

const nf = new Intl.NumberFormat('fr-FR');
const money = (n: number): string => `${nf.format(n)} $`;

/**
 * Panneau de gestion / correction (direction). Corrige les erreurs de compta
 * proprement : reouverture de semaine, annulation d'une commande ou d'une vente.
 * Tout est audite ; la compta est recalculee depuis la source.
 */
export const gestionCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('gestion')
    .setDescription('Correction de la comptabilité (direction)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('voir').setDescription('Détail de la semaine en cours (pour repérer une erreur)'),
    )
    .addSubcommand((s) =>
      s
        .setName('rouvrir-semaine')
        .setDescription('Rouvrir la dernière semaine clôturée pour corriger une erreur'),
    )
    .addSubcommand((s) =>
      s
        .setName('annuler-commande')
        .setDescription('Annuler une commande client erronée (même payée)')
        .addStringOption((o) =>
          o.setName('reference').setDescription('Référence CMD-AAAA-NNNN').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('motif').setDescription('Motif de la correction').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('annuler-vente')
        .setDescription('Annuler une vente erronée (PNJ HD- ou main en main VD-)')
        .addStringOption((o) =>
          o.setName('reference').setDescription('Référence HD- ou VD-').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('motif').setDescription('Motif de la correction').setRequired(true),
        ),
    )
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
    const actorId = interaction.user.id;

    if (sub === 'rouvrir-semaine') {
      const res = await reopenLastClosedWeek(
        config.id,
        interaction.guild.id,
        actorId,
        randomUUID(),
      );
      if (!res.ok) {
        await interaction.editReply(`Échec : ${res.reason}`);
        return;
      }
      await updateDashboardsNow(interaction.client, config.id).catch(() => undefined);
      await interaction.editReply(
        '✅ Semaine rouverte. Corrige ce qu’il faut (`/gestion annuler-commande` / `annuler-vente`), puis re-clôture avec `/semaine cloturer`.',
      );
      return;
    }

    if (sub === 'annuler-commande') {
      const reference = interaction.options.getString('reference', true).trim().toUpperCase();
      const motif = interaction.options.getString('motif', true).trim();
      const res = await adminCancelOrder(config.id, reference, actorId, motif, randomUUID());
      if (!res.ok) {
        await interaction.editReply(`Échec : ${res.reason}`);
        return;
      }
      await updateDashboardsNow(interaction.client, config.id).catch(() => undefined);
      await interaction.editReply(
        `✅ Commande **${res.data.reference}** annulée. Compta recalculée.`,
      );
      return;
    }

    if (sub === 'annuler-vente') {
      const reference = interaction.options.getString('reference', true).trim().toUpperCase();
      const motif = interaction.options.getString('motif', true).trim();
      const res = await adminCancelSale(config.id, reference, actorId, motif, randomUUID());
      if (!res.ok) {
        await interaction.editReply(`Échec : ${res.reason}`);
        return;
      }
      await updateDashboardsNow(interaction.client, config.id).catch(() => undefined);
      await interaction.editReply(`✅ Vente **${res.data.reference}** annulée. Compta recalculée.`);
      return;
    }

    // voir : detail de la semaine ouverte pour reperer l'erreur
    const week = await getOpenWeek(config.id);
    if (!week) {
      await interaction.editReply('Aucune semaine ouverte.');
      return;
    }
    const [sales, orders, directSales] = await Promise.all([
      prisma.sale.findMany({
        where: { weekId: week.id, status: SaleStatus.VALIDEE },
        select: { reference: true, validatedQuantity: true, pnjUnitPriceSnapshot: true },
        orderBy: { reference: 'asc' },
        take: 15,
      }),
      prisma.clientOrder.findMany({
        where: { guildConfigId: config.id, weekId: week.id, status: ClientOrderStatus.PAYEE },
        select: { reference: true, clientName: true, negotiatedPrice: true },
        orderBy: { reference: 'asc' },
        take: 15,
      }),
      prisma.directSale.findMany({
        where: { weekId: week.id, status: SaleStatus.VALIDEE },
        select: {
          reference: true,
          lines: { select: { validatedQuantity: true, unitPrice: true } },
        },
        orderBy: { reference: 'asc' },
        take: 15,
      }),
    ]);

    const salesTxt =
      sales
        .map(
          (s) =>
            `• ${s.reference} — ${s.validatedQuantity ?? 0} u — ${money((s.validatedQuantity ?? 0) * (s.pnjUnitPriceSnapshot ?? 0))}`,
        )
        .join('\n') || '_aucune_';
    const ordersTxt =
      orders
        .map((o) => `• ${o.reference} — ${o.clientName} — ${money(o.negotiatedPrice)}`)
        .join('\n') || '_aucune_';
    const directTxt =
      directSales
        .map((d) => {
          const { revenue } = computeDirectSaleTotals(
            d.lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.validatedQuantity ?? 0 })),
          );
          return `• ${d.reference} — ${money(revenue)}`;
        })
        .join('\n') || '_aucune_';

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Détail de la semaine en cours')
          .setColor(0x2e86de)
          .addFields(
            { name: 'Ventes PNJ validées', value: salesTxt },
            { name: 'Commandes payées', value: ordersTxt },
            { name: 'Ventes main en main', value: directTxt },
          )
          .setFooter({
            text: 'Annule une ligne erronée avec /gestion annuler-commande ou annuler-vente',
          }),
      ],
    });
  },
};
