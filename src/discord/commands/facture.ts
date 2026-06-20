import { AttachmentType } from '@prisma/client';
import {
  type AutocompleteInteraction,
  ChannelType,
  type ChatInputCommandInteraction,
  type ForumChannel,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { getOpenWeek } from '../../modules/accounting/accountingService.js';
import {
  getEmployeeByDiscordId,
  getGuildConfigByGuildId,
  resolveMemberGrade,
} from '../../modules/employees/employeeService.js';
import {
  findActiveProductByName,
  listActiveProducts,
} from '../../modules/products/productService.js';
import {
  createDirectSale,
  getDirectSaleById,
  type DirectSaleLineInput,
} from '../../modules/directSales/directSaleService.js';
import { ForumTagKey } from '@prisma/client';
import { downloadAndStore, isImageAttachment } from '../../modules/sales/attachments.js';
import { evaluateDirectSaleFraud } from '../../modules/sales/fraudService.js';
import { riskBadge } from '../../modules/sales/fraud.js';
import { setCasierTag } from '../../modules/lockers/casierTags.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { mentionDirection, postToLogs } from '../notify.js';
import { createDirectControlPost } from '../directSales/fiche.js';
import type { SlashCommand } from './types.js';

const LINE_SLOTS = [1, 2, 3] as const;

/**
 * Declaration d'une vente main en main (CDC : facture). L'employe choisit ses
 * produits (autocompletion du menu) + quantites + photo de la facture ; le bot
 * cree la vente et la fiche de controle pour validation par la direction.
 */
export const factureCommand: SlashCommand = {
  data: (() => {
    const b = new SlashCommandBuilder()
      .setName('facture')
      .setDescription('Déclarer une vente main en main (facture)');
    for (const i of LINE_SLOTS) {
      b.addStringOption((o) =>
        o
          .setName(`produit${i}`)
          .setDescription(`Produit ${i}`)
          .setAutocomplete(true)
          .setRequired(i === 1),
      );
      b.addIntegerOption((o) =>
        o
          .setName(`quantite${i}`)
          .setDescription(`Quantité du produit ${i}`)
          .setMinValue(1)
          .setRequired(i === 1),
      );
    }
    b.addAttachmentOption((o) =>
      o.setName('facture').setDescription('Photo de la facture in-game').setRequired(true),
    );
    b.addStringOption((o) =>
      o.setName('client').setDescription('Nom RP du client (optionnel)').setRequired(false),
    );
    return b.toJSON();
  })(),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (!interaction.inGuild()) return void interaction.respond([]);
    const config = await getGuildConfigByGuildId(interaction.guildId);
    if (!config) return void interaction.respond([]);
    const focused = interaction.options.getFocused().toString().toLowerCase();
    const products = await listActiveProducts(config.id);
    const choices = products
      .filter((p) => p.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((p) => ({ name: `${p.name} — ${p.retailPrice} $`, value: p.name }));
    await interaction.respond(choices);
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
    const employee = await getEmployeeByDiscordId(interaction.user.id);
    if (!employee || employee.guildConfigId !== config.id || employee.status !== 'ACTIVE') {
      await interaction.reply({
        content: 'Tu n’es pas enregistré comme employé actif.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const facture = interaction.options.getAttachment('facture', true);
    if (!isImageAttachment(facture)) {
      await interaction.reply({
        content: 'La facture doit être une image (capture d’écran).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const buyer = interaction.options.getString('client')?.trim() || null;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const week = await getOpenWeek(config.id);
    if (!week) {
      await interaction.editReply('Aucune semaine comptable ouverte. Préviens la direction.');
      return;
    }

    // Resolution des lignes (produit + quantite) contre le menu.
    const lines: DirectSaleLineInput[] = [];
    for (const i of LINE_SLOTS) {
      const name = interaction.options.getString(`produit${i}`);
      const qty = interaction.options.getInteger(`quantite${i}`);
      if (!name && qty === null) continue;
      if (!name || qty === null) {
        await interaction.editReply(`Produit ${i} : indique à la fois le produit ET la quantité.`);
        return;
      }
      const product = await findActiveProductByName(config.id, name);
      if (!product) {
        await interaction.editReply(
          `Produit introuvable au menu : « ${name} ». Vois \`/menu voir\`.`,
        );
        return;
      }
      lines.push({
        productId: product.id,
        productName: product.name,
        unitPrice: product.retailPrice,
        quantity: qty,
      });
    }
    if (lines.length === 0) {
      await interaction.editReply('Indique au moins un produit et sa quantité.');
      return;
    }

    // Grade (non bloquant : anomalie signalee a la direction).
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    let gradeLabel: string | null = null;
    let gradeRoleId: string | null = null;
    let salaryRate: number | null = null;
    let gradeWarning: string | null = null;
    if (!member) {
      gradeWarning = 'Membre introuvable au moment de la déclaration.';
    } else {
      const grade = await resolveMemberGrade(member, config.id);
      if (grade.selected) {
        gradeLabel = grade.selected.label;
        gradeRoleId = grade.selected.roleId;
        salaryRate = grade.selected.ratePerUnit;
      }
      if (grade.missing) gradeWarning = 'Aucun grade salarial reconnu.';
      else if (grade.ambiguous) gradeWarning = 'Plusieurs grades reconnus.';
    }

    // Copie durable de la facture.
    let stored;
    try {
      stored = [
        await downloadAndStore({
          guildId: interaction.guild.id,
          threadId: `facture-${interaction.id}`,
          type: AttachmentType.COFFRE_PLEIN, // emplacement de stockage (facture)
          messageId: interaction.id,
          attachment: facture,
        }),
      ];
    } catch {
      await interaction.editReply('Échec de la copie de la facture. Réessaie.');
      return;
    }

    const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
    const risk = await evaluateDirectSaleFraud({
      guildConfigId: config.id,
      quantity: totalQty,
      hashes: stored.map((s) => s.sha256),
    });

    const created = await createDirectSale({
      guildConfigId: config.id,
      employeeId: employee.id,
      buyerName: buyer,
      lines,
      attachments: stored,
      gradeLabel,
      gradeRoleId,
      salaryRate,
      riskLevel: risk.level,
      riskReasons: risk.reasons.length > 0 ? risk.reasons.join(' ') : null,
      declaredAt: new Date(),
      authorDiscordId: employee.discordUserId,
    });
    if (!created.ok) {
      await interaction.editReply(`Échec : ${created.reason}`);
      return;
    }

    // Trace dans le casier de l'employe (parite avec les ventes PNJ).
    if (employee.casierForumId) {
      try {
        const casier = await interaction.guild.channels.fetch(employee.casierForumId);
        if (casier?.type === ChannelType.GuildForum) {
          const revenue = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
          const linesTxt = lines
            .map(
              (l) =>
                `• ${l.productName} ×${l.quantity} @ ${l.unitPrice} $ = ${l.unitPrice * l.quantity} $`,
            )
            .join('\n');
          const content =
            `**Vente main en main — ${created.data.reference}**\n${linesTxt}\n` +
            `Total : ${totalQty} produit(s) — ${revenue} $` +
            (buyer ? `\nClient : ${buyer}` : '');
          const thread = await (casier as ForumChannel).threads.create({
            name: `${created.data.reference} — main en main`,
            message: { content, files: [facture] },
          });
          await prisma.directSale.update({
            where: { id: created.data.id },
            data: { threadId: thread.id },
          });
          await setCasierTag(thread, employee.casierForumId, ForumTagKey.A_VERIFIER);
        }
      } catch (err) {
        logger.warn({ err }, 'Post casier vente directe KO (non bloquant)');
      }
    }

    // Fiche de controle dans le Forum de controle.
    if (config.channelControl) {
      try {
        const controlChannel = await interaction.guild.channels.fetch(config.channelControl);
        if (controlChannel?.type === ChannelType.GuildForum) {
          const sale = await getDirectSaleById(created.data.id);
          if (sale) {
            const thread = await createDirectControlPost(
              controlChannel as ForumChannel,
              sale,
              mentionDirection(config),
            );
            await prisma.directSale.update({
              where: { id: created.data.id },
              data: { controlThreadId: thread.id },
            });
          }
        } else {
          logger.warn('channelControl n’est pas un Forum : fiche vente directe non creee');
        }
      } catch (err) {
        logger.error({ err }, 'Creation fiche vente directe KO');
      }
    }

    if (risk.level !== 'CLEAN') {
      await postToLogs(interaction.guild, config, {
        content: `${mentionDirection(config)} ${riskBadge(risk.level)} Vente directe ${created.data.reference} signalée : ${risk.reasons.join(' ')}`,
      });
    }

    const warn = gradeWarning ? `\n⚠️ ${gradeWarning}` : '';
    await interaction.editReply(
      `✅ Vente **${created.data.reference}** déclarée (${totalQty} produit(s)). La direction va la vérifier.${warn}`,
    );
  },
};
