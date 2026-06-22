import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ForumChannel,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import {
  associateEmployee,
  getGuildConfigByGuildId,
} from '../../modules/employees/employeeService.js';
import { mapForumTags } from '../../modules/lockers/forumTags.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import { buildConfirmMessage } from '../panel/confirmUi.js';
import { putPending } from '../panel/pending.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

async function syncForumTags(guildConfigId: string, forum: ForumChannel): Promise<number> {
  const mapped = mapForumTags(forum.availableTags.map((t) => ({ id: t.id, name: t.name })));
  const entries = Object.entries(mapped) as [keyof typeof mapped, string][];
  for (const [key, discordTagId] of entries) {
    await prisma.forumTag.upsert({
      where: { forumChannelId_key: { forumChannelId: forum.id, key } },
      create: { guildConfigId, forumChannelId: forum.id, key, discordTagId },
      update: { discordTagId },
    });
  }
  return entries.length;
}

export const employeCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('employe')
    .setDescription('Gestion des employes et casiers')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('associer')
        .setDescription('Associer un membre, un nom RP et un casier (Forum)')
        .addUserOption((o) =>
          o.setName('membre').setDescription('Membre Discord').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('nom_rp').setDescription('Nom RP de l’employe').setRequired(true),
        )
        .addChannelOption((o) =>
          o
            .setName('casier')
            .setDescription('Forum casier de l’employe')
            .addChannelTypes(ChannelType.GuildForum)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('archiver')
        .setDescription('Archiver un employe (conserve l’historique)')
        .addUserOption((o) =>
          o.setName('membre').setDescription('Membre a archiver').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('bracelet')
        .setDescription('Définir le multiplicateur bracelet d’un employé (équité de la prime)')
        .addUserOption((o) => o.setName('membre').setDescription('Employé').setRequired(true))
        .addIntegerOption((o) =>
          o
            .setName('multiplicateur')
            .setDescription('1 = aucun, 2 = x2, 3 = x3…')
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(true),
        ),
    )
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: 'Commande utilisable uniquement dans un serveur.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = await getGuildConfigByGuildId(interaction.guild.id);
    if (!config) {
      await interaction.reply({
        content: 'Aucune configuration enregistree. Lance d’abord le seed de configuration.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!(await isDirection(interaction, config))) {
      await interaction.reply({
        content: 'Action reservee a la direction.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    const member = interaction.options.getUser('membre', true);

    if (sub === 'associer') {
      const nomRP = interaction.options.getString('nom_rp', true).trim();
      const casierOption = interaction.options.getChannel('casier', true);
      const channel = await interaction.guild.channels.fetch(casierOption.id).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildForum) {
        await interaction.editReply('Le casier doit etre un salon de type Forum.');
        return;
      }
      const forum = channel as ForumChannel;

      const employee = await associateEmployee({
        guildConfigId: config.id,
        discordUserId: member.id,
        nomRP,
        casierForumId: forum.id,
      });
      const tagCount = await syncForumTags(config.id, forum);

      await writeAudit(prisma, {
        guildConfigId: config.id,
        action: 'EMPLOYEE_ASSOCIATED',
        authorDiscordId: interaction.user.id,
        entityType: 'Employee',
        entityId: employee.id,
        after: { discordUserId: member.id, nomRP, casierForumId: forum.id },
      });

      const embed = new EmbedBuilder()
        .setTitle('Employe associe')
        .setColor(0x2ecc71)
        .addFields(
          { name: 'Membre', value: `<@${member.id}>`, inline: true },
          { name: 'Nom RP', value: nomRP, inline: true },
          { name: 'Casier', value: `<#${forum.id}>`, inline: true },
          { name: 'Tags cartographies', value: String(tagCount), inline: true },
        );
      if (tagCount < 6) {
        embed.setFooter({
          text: 'Certains tags du casier n’ont pas ete reconnus. Verifie les noms des tags du Forum.',
        });
      }
      await interaction.editReply({ embeds: [embed] });
      // Rafraichit le tableau "Developpement de l'entreprise" (nouvel employe).
      scheduleDashboardUpdate(interaction.client, config.id);
      logger.info({ employeeId: employee.id, tagCount }, 'Employe associe');
      return;
    }

    if (sub === 'archiver') {
      const existing = await prisma.employee.findUnique({ where: { discordUserId: member.id } });
      if (!existing) {
        await interaction.editReply('Aucun employe associe a ce membre.');
        return;
      }
      if (existing.status === 'ARCHIVED') {
        await interaction.editReply(`**${existing.nomRP}** est déjà archivé.`);
        return;
      }
      const token = putPending(interaction.user.id, {
        kind: 'archive',
        guildConfigId: config.id,
        discordUserId: member.id,
        nomRP: existing.nomRP,
      });
      await interaction.editReply(
        buildConfirmMessage({
          title: '📦 Archiver un employé',
          description: `Archiver **${existing.nomRP}** (<@${member.id}>) ? Ses futures ventes ne seront plus comptées, mais tout l’historique est conservé.`,
          token,
          confirmLabel: 'Archiver',
          danger: true,
        }),
      );
      return;
    }

    if (sub === 'bracelet') {
      const multiplier = interaction.options.getInteger('multiplicateur', true);
      const existing = await prisma.employee.findUnique({ where: { discordUserId: member.id } });
      if (!existing || existing.guildConfigId !== config.id) {
        await interaction.editReply('Aucun employé associé à ce membre.');
        return;
      }
      await prisma.employee.update({
        where: { id: existing.id },
        data: { bonusMultiplier: multiplier },
      });
      await writeAudit(prisma, {
        guildConfigId: config.id,
        action: 'EMPLOYEE_BRACELET_SET',
        authorDiscordId: interaction.user.id,
        entityType: 'Employee',
        entityId: existing.id,
        before: { bonusMultiplier: existing.bonusMultiplier },
        after: { bonusMultiplier: multiplier },
      });
      scheduleDashboardUpdate(interaction.client, config.id);
      await interaction.editReply(
        multiplier === 1
          ? `✅ **${existing.nomRP}** : aucun bracelet (×1). Sa production compte telle quelle pour la prime.`
          : `✅ **${existing.nomRP}** : bracelet **×${multiplier}**. Pour la prime, sa production sera divisée par ${multiplier} (équité).`,
      );
    }
  },
};
