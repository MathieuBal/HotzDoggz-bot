import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import { upsertGradeRate } from '../../modules/employees/employeeService.js';
import { updateDashboardsNow } from '../../modules/dashboards/scheduler.js';
import { updateReviewBoard } from '../../modules/reviews/reviewBoardService.js';
import { publishDirectionGuide } from '../guides/directionGuide.js';
import { logger } from '../../infrastructure/logging/logger.js';
import type { SlashCommand } from './types.js';

// Liaison option -> champ GuildConfig + libelle/tarif du grade.
const ROLE_MAP = [
  { opt: 'directeur', field: 'roleDirecteur', label: 'Directeur', rate: 185 },
  { opt: 'co_directeur', field: 'roleCoDirecteur', label: 'Co-directeur', rate: 185 },
  { opt: 'chef_equipe', field: 'roleChefEquipe', label: "Chef d'equipe", rate: 175 },
  { opt: 'experimente', field: 'roleExperimente', label: 'Experimente', rate: 165 },
  { opt: 'novice', field: 'roleNovice', label: 'Novice', rate: 155 },
  { opt: 'stagiaire', field: 'roleStagiaire', label: 'Stagiaire', rate: 145 },
] as const;

const CHANNEL_MAP = [
  { opt: 'controle', field: 'channelControl' },
  { opt: 'comptabilite', field: 'channelAccounting' },
  { opt: 'paies', field: 'channelPayroll' },
  { opt: 'logs', field: 'channelLogs' },
  { opt: 'tableau', field: 'channelWeeklyBoard' },
  { opt: 'developpement', field: 'channelCompanyBoard' },
  { opt: 'commandes', field: 'channelOrders' },
  { opt: 'avis', field: 'channelReviews' },
  { opt: 'partenariats', field: 'channelPartnerships' },
  { opt: 'guide_direction', field: 'channelGuideDirection' },
  { opt: 'guide_equipe', field: 'channelGuideEmployee' },
] as const;

export const configCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configuration du bot (roles et salons)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('roles')
        .setDescription('Lie les roles de grade et de direction (renseigne ceux a definir)')
        .addRoleOption((o) => o.setName('directeur').setDescription('Role Directeur'))
        .addRoleOption((o) => o.setName('co_directeur').setDescription('Role Co-directeur'))
        .addRoleOption((o) => o.setName('chef_equipe').setDescription("Role Chef d'equipe"))
        .addRoleOption((o) => o.setName('experimente').setDescription('Role Experimente'))
        .addRoleOption((o) => o.setName('novice').setDescription('Role Novice'))
        .addRoleOption((o) => o.setName('stagiaire').setDescription('Role Stagiaire')),
    )
    .addSubcommand((s) =>
      s
        .setName('salons')
        .setDescription('Lie les salons (renseigne ceux a definir)')
        .addChannelOption((o) =>
          o
            .setName('controle')
            .setDescription('Forum de controle (fiches de vente)')
            .addChannelTypes(ChannelType.GuildForum),
        )
        .addChannelOption((o) =>
          o
            .setName('comptabilite')
            .setDescription('Salon comptabilite')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o.setName('paies').setDescription('Salon paies').addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('logs')
            .setDescription('Salon logs-et-archives')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('tableau')
            .setDescription('Salon tableau-de-bord-hebdo')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('developpement')
            .setDescription("Salon employe 'Developpement de l'entreprise'")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('commandes')
            .setDescription("Salon direction 'commandes client a realiser'")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('avis')
            .setDescription("Salon public 'avis clients'")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('partenariats')
            .setDescription("Salon employe 'objectifs partenariats'")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('guide_direction')
            .setDescription('Salon tuto direction (guide des commandes)')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('guide_equipe')
            .setDescription('Salon tuto employes (process)')
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({ content: 'Serveur requis.', flags: MessageFlags.Ephemeral });
      return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: 'Reserve aux gestionnaires du serveur (permission Gerer le serveur).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'roles') {
      const fields: Record<string, string> = {};
      const grades: Array<{ roleId: string; label: string; rate: number }> = [];
      for (const m of ROLE_MAP) {
        const role = interaction.options.getRole(m.opt);
        if (role) {
          fields[m.field] = role.id;
          grades.push({ roleId: role.id, label: m.label, rate: m.rate });
        }
      }
      if (Object.keys(fields).length === 0) {
        await interaction.editReply('Aucun role fourni. Renseigne au moins un role.');
        return;
      }

      const config = await prisma.guildConfig.upsert({
        where: { guildId },
        create: { guildId, timezone: 'Europe/Paris', ...fields },
        update: fields,
      });
      for (const g of grades) {
        await upsertGradeRate(config.id, g.roleId, g.label, g.rate);
      }
      await writeAudit(prisma, {
        guildConfigId: config.id,
        action: 'CONFIG_ROLES_SET',
        authorDiscordId: interaction.user.id,
        after: fields,
      });

      const lines = grades.map((g) => `• ${g.label} → <@&${g.roleId}> (${g.rate} $/u)`).join('\n');
      await interaction.editReply({
        embeds: [
          new EmbedBuilder().setTitle('Roles configures').setColor(0x2ecc71).setDescription(lines),
        ],
      });
      return;
    }

    if (sub === 'salons') {
      const fields: Record<string, string> = {};
      const summary: string[] = [];
      for (const m of CHANNEL_MAP) {
        const channel = interaction.options.getChannel(m.opt);
        if (channel) {
          fields[m.field] = channel.id;
          summary.push(`• ${m.opt} → <#${channel.id}>`);
        }
      }
      if (Object.keys(fields).length === 0) {
        await interaction.editReply('Aucun salon fourni. Renseigne au moins un salon.');
        return;
      }

      const config = await prisma.guildConfig.upsert({
        where: { guildId },
        create: { guildId, timezone: 'Europe/Paris', ...fields },
        update: fields,
      });
      await writeAudit(prisma, {
        guildConfigId: config.id,
        action: 'CONFIG_CHANNELS_SET',
        authorDiscordId: interaction.user.id,
        after: fields,
      });

      // Republication immediate dans les salons concernes (plus besoin de
      // redemarrer le bot). On ne touche qu'aux supports lies au(x) salon(s)
      // qui viennent d'etre configures.
      const published: string[] = [];
      const touched = new Set(Object.keys(fields));
      const dashboardFields = [
        'channelWeeklyBoard',
        'channelAccounting',
        'channelPayroll',
        'channelCompanyBoard',
        'channelOrders',
        'channelPartnerships',
      ];
      const tasks: Array<Promise<unknown>> = [];
      if (dashboardFields.some((f) => touched.has(f))) {
        tasks.push(updateDashboardsNow(interaction.client, config.id));
        published.push('tableaux de bord');
      }
      if (touched.has('channelReviews')) {
        tasks.push(updateReviewBoard(interaction.client, config.id));
        published.push('bandeau avis clients');
      }
      if (touched.has('channelGuideDirection')) {
        tasks.push(publishDirectionGuide(interaction.client, config.id));
        published.push('guide direction');
      }
      const results = await Promise.allSettled(tasks);
      const failed = results.filter((r) => r.status === 'rejected');
      for (const r of failed) {
        logger.warn({ err: (r as PromiseRejectedResult).reason }, 'Republication post-config KO');
      }

      const footer =
        published.length > 0
          ? failed.length > 0
            ? `\n\n⚠️ Publication tentée (${published.join(', ')}) mais au moins un support a échoué — vérifie les permissions du bot puis relance \`/hotzdogz diagnostic\`.`
            : `\n\n📢 Publié automatiquement : ${published.join(', ')}.`
          : '';

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Salons configures')
            .setColor(failed.length > 0 ? 0xe67e22 : 0x2ecc71)
            .setDescription(summary.join('\n') + footer),
        ],
      });
    }
  },
};
