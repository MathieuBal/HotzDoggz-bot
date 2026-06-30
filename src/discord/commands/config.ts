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
import { publishVerification } from '../verification/verificationBoard.js';
import { publishMenuBoard } from '../menu/menuBoard.js';
import { publishEventBoard } from '../vitrine/vitrineBoards.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { renderWelcomeMessage } from '../../modules/welcome/welcomeMessage.js';
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
  { opt: 'accueil', field: 'channelWelcome' },
  { opt: 'reglement', field: 'channelReglement' },
  { opt: 'menu', field: 'channelMenuBoard' },
  { opt: 'evenement', field: 'channelEvent' },
  { opt: 'prime', field: 'channelBonusBoard' },
  { opt: 'planning', field: 'channelPlanning' },
  { opt: 'stock', field: 'channelStock' },
  { opt: 'garage', field: 'channelGarage' },
  { opt: 'palmares', field: 'channelPalmares' },
  { opt: 'gestion', field: 'channelStaff' },
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
        .addRoleOption((o) => o.setName('stagiaire').setDescription('Role Stagiaire'))
        .addRoleOption((o) =>
          o.setName('client').setDescription('Role Client (visiteurs ayant accepté le règlement)'),
        ),
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
        )
        .addChannelOption((o) =>
          o
            .setName('accueil')
            .setDescription('Salon d’accueil des nouveaux arrivants')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('reglement')
            .setDescription('Salon règlement (reçoit le bouton de validation d’accès)')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('menu')
            .setDescription('Salon public menu & tarifs (maintenu par le bot)')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('evenement')
            .setDescription('Salon événement (vitrine maintenue par le bot)')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('prime')
            .setDescription('Salon employé « prime » (répartition dégressive en direct)')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('planning')
            .setDescription('Salon employé « planning » (agenda commandes + positionnement)')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('stock')
            .setDescription('Salon employé « stock » (saucisses par véhicule + péremption)')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('garage')
            .setDescription('Salon « garage » (catalogue des véhicules + attribution)')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('palmares')
            .setDescription('Salon « palmarès » (classement + prestige, permanent)')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName('gestion')
            .setDescription('Salon direction « gestion des employés » (trombinoscope + cartes)')
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('accueil')
        .setDescription('Personnaliser le message de bienvenue (placeholders {membre} {serveur})')
        .addStringOption((o) =>
          o
            .setName('message')
            .setDescription('Texte RP. Laisse vide pour voir/réinitialiser. {membre} = mention.')
            .setRequired(false),
        )
        .addBooleanOption((o) =>
          o
            .setName('defaut')
            .setDescription('Remettre le message d’accueil par défaut')
            .setRequired(false),
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

    if (sub === 'accueil') {
      const message = interaction.options.getString('message')?.trim() || null;
      const reset = interaction.options.getBoolean('defaut') ?? false;

      // Sans argument : on affiche un apercu du message courant.
      if (!message && !reset) {
        const current = await prisma.guildConfig.findUnique({
          where: { guildId },
          select: { welcomeMessage: true, channelWelcome: true },
        });
        const preview = renderWelcomeMessage(current?.welcomeMessage ?? null, {
          mention: `@${interaction.user.username}`,
          guildName: interaction.guild.name,
        });
        const channelNote = current?.channelWelcome
          ? `Salon d’accueil : <#${current.channelWelcome}>`
          : '⚠️ Aucun salon d’accueil lié (`/config salons accueil:#…`).';
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Message d’accueil')
              .setColor(0xff7a00)
              .setDescription(preview)
              .setFooter({
                text: 'Placeholders : {membre}, {serveur}. Modifie avec /config accueil message:…',
              }),
          ],
          content: channelNote,
        });
        return;
      }

      const newValue = reset ? null : message;
      const config = await prisma.guildConfig.upsert({
        where: { guildId },
        create: { guildId, timezone: 'Europe/Paris', welcomeMessage: newValue },
        update: { welcomeMessage: newValue },
      });
      await writeAudit(prisma, {
        guildConfigId: config.id,
        action: 'CONFIG_WELCOME_SET',
        authorDiscordId: interaction.user.id,
        after: { welcomeMessage: newValue ?? '(défaut)' },
      });
      const shown = renderWelcomeMessage(newValue, {
        mention: `@${interaction.user.username}`,
        guildName: interaction.guild.name,
      });
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(reset ? 'Message d’accueil réinitialisé' : 'Message d’accueil mis à jour')
            .setColor(0x2ecc71)
            .setDescription(shown)
            .setFooter({ text: 'Aperçu (la mention pingera vraiment le nouvel arrivant)' }),
        ],
      });
      return;
    }

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
      // Le role Client n'est PAS un grade (pas de tarif) : on le lie a part.
      const clientRole = interaction.options.getRole('client');
      if (clientRole) fields.roleClient = clientRole.id;

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

      const lines = grades.map((g) => `• ${g.label} → <@&${g.roleId}> (${g.rate} $/u)`);
      if (clientRole) lines.push(`• Client → <@&${clientRole.id}> (accès visiteurs)`);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Roles configures')
            .setColor(0x2ecc71)
            .setDescription(lines.join('\n')),
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
        'channelBonusBoard',
        'channelPlanning',
        'channelStock',
        'channelGarage',
        'channelPalmares',
        'channelStaff',
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
      if (touched.has('channelReglement')) {
        tasks.push(publishVerification(interaction.client, config.id));
        published.push('sas d’accès (règlement)');
      }
      if (touched.has('channelMenuBoard')) {
        tasks.push(publishMenuBoard(interaction.client, config.id));
        published.push('menu & tarifs');
      }
      if (touched.has('channelEvent')) {
        tasks.push(publishEventBoard(interaction.client, config.id));
        published.push('vitrine événement');
      }
      const results = await Promise.allSettled(tasks);
      const failed = results.filter((r) => r.status === 'rejected');
      for (const r of failed) {
        logger.warn({ err: (r as PromiseRejectedResult).reason }, 'Republication post-config KO');
      }

      const footer =
        published.length > 0
          ? failed.length > 0
            ? `\n\n⚠️ Publication tentée (${published.join(', ')}) mais au moins un support a échoué — vérifie les permissions du bot puis relance \`/hotzdoggz diagnostic\`.`
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
