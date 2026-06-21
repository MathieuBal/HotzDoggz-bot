import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ForumChannel,
} from 'discord.js';
import { ForumTagKey } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { getOpenWeek } from '../../modules/accounting/accountingService.js';
import {
  getEmployeeByDiscordId,
  getGuildConfigByGuildId,
  resolveMemberGrade,
} from '../../modules/employees/employeeService.js';
import { isImageAttachment } from '../../modules/sales/attachments.js';
import { ingestAssistedSale } from '../../modules/sales/ingestionService.js';
import type { SlashCommand } from './types.js';

/**
 * Declaration assistee : l'employe fournit quantite + 2 preuves, le bot cree le
 * post au bon format dans son casier et enregistre la vente (CDC §4.1, format
 * garanti). Accessible a tout employe associe.
 */
export const vendreCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('vendre')
    .setDescription('Declarer une vente au PNJ (le bot cree le post au bon format)')
    .addIntegerOption((o) =>
      o
        .setName('quantite')
        .setDescription('Nombre de hot dogs vendus')
        .setMinValue(1)
        .setRequired(true),
    )
    .addAttachmentOption((o) =>
      o
        .setName('preuve_avant')
        .setDescription('Capture du coffre PLEIN avant la vente')
        .setRequired(true),
    )
    .addAttachmentOption((o) =>
      o
        .setName('preuve_apres')
        .setDescription('Capture du coffre VIDE apres la vente')
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('commentaire').setDescription('Commentaire eventuel').setRequired(false),
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

    const employee = await getEmployeeByDiscordId(interaction.user.id);
    if (!employee || employee.guildConfigId !== config.id || employee.status !== 'ACTIVE') {
      await interaction.reply({
        content: 'Tu n’es pas enregistre comme employe actif.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!employee.casierForumId) {
      await interaction.reply({
        content: 'Aucun casier associe a ton compte. Contacte la direction.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const quantity = interaction.options.getInteger('quantite', true);
    const before = interaction.options.getAttachment('preuve_avant', true);
    const after = interaction.options.getAttachment('preuve_apres', true);
    const comment = interaction.options.getString('commentaire')?.trim() || null;

    if (!isImageAttachment(before) || !isImageAttachment(after)) {
      await interaction.reply({
        content: 'Les deux preuves doivent etre des images (captures d’ecran).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const week = await getOpenWeek(config.id);
    if (!week) {
      await interaction.editReply('Aucune semaine comptable ouverte. Previens la direction.');
      return;
    }

    const casier = await interaction.guild.channels.fetch(employee.casierForumId).catch(() => null);
    if (!casier || casier.type !== ChannelType.GuildForum) {
      await interaction.editReply('Ton casier est introuvable ou n’est pas un Forum.');
      return;
    }
    const forum = casier as ForumChannel;

    // Resolution du grade (non bloquante : anomalie signalee a la direction).
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    let gradeLabel: string | null = null;
    let gradeRoleId: string | null = null;
    let salaryRate: number | null = null;
    let gradeWarning: string | null = null;
    if (!member) {
      gradeWarning = 'Membre introuvable au moment de la declaration.';
    } else {
      const grade = await resolveMemberGrade(member, config.id);
      if (grade.selected) {
        gradeLabel = grade.selected.label;
        gradeRoleId = grade.selected.roleId;
        salaryRate = grade.selected.ratePerUnit;
      }
      if (grade.missing) gradeWarning = 'Aucun grade salarial reconnu.';
      else if (grade.ambiguous) {
        gradeWarning = `Plusieurs grades reconnus (${grade.matched.map((m) => m.label).join(', ')}).`;
      }
    }

    // Tag "Nouvelle vente" du casier (si cartographie).
    const tag = await prisma.forumTag.findUnique({
      where: {
        forumChannelId_key: {
          forumChannelId: employee.casierForumId,
          key: ForumTagKey.NOUVELLE_VENTE,
        },
      },
    });

    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { timeZone: config.timezone });
    const timeStr = now.toLocaleTimeString('fr-FR', {
      timeZone: config.timezone,
      hour: '2-digit',
      minute: '2-digit',
    });
    const content =
      `Quantité vendue : ${quantity}\nDate : ${dateStr}\nHeure : ${timeStr}` +
      (comment ? `\nCommentaire : ${comment}` : '');

    let thread;
    try {
      thread = await forum.threads.create({
        name: `VENTE - ${quantity} hot dogs - ${dateStr}`,
        message: { content, files: [before, after] },
        appliedTags: tag ? [tag.discordTagId] : undefined,
      });
    } catch (err) {
      logger.error({ err, casier: employee.casierForumId }, 'Creation du post /vendre echouee');
      await interaction.editReply(
        'Impossible de creer le post dans ton casier (permissions du bot ?).',
      );
      return;
    }

    const starter = await thread.fetchStarterMessage().catch(() => null);

    const result = await ingestAssistedSale({
      thread,
      guild: interaction.guild,
      config,
      employee: {
        id: employee.id,
        nomRP: employee.nomRP,
        discordUserId: employee.discordUserId,
      },
      weekId: week.id,
      quantity,
      starterMessageId: starter?.id ?? thread.id,
      attachmentPlein: before,
      attachmentVide: after,
      gradeLabel,
      gradeRoleId,
      salaryRate,
      gradeWarning,
    });

    if (!result.ok) {
      await interaction.editReply(`Echec : ${result.reason}`);
      return;
    }
    const ficheWarn = result.ficheCreated
      ? ' La direction va la verifier.'
      : '\n❌ **Fiche de controle non creee** : la direction ne la verra pas a valider. ' +
        'Previens-la (verifier le salon `controle` et les permissions du bot).';
    await interaction.editReply(`✅ Vente declaree — reference **${result.reference}**.${ficheWarn}`);
  },
};
