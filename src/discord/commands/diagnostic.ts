import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildBasedChannel,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import type { SlashCommand } from './types.js';

const OK = '✅';
const WARN = '⚠️';
const FAIL = '❌';

type Line = string;

function roleLine(guild: Guild, label: string, id: string | null | undefined): Line {
  if (!id) return `${WARN} ${label} : non configure`;
  const role = guild.roles.cache.get(id);
  return role ? `${OK} ${label} : @${role.name}` : `${FAIL} ${label} : role introuvable (${id})`;
}

async function channelLine(
  guild: Guild,
  label: string,
  id: string | null | undefined,
  needs: bigint[],
): Promise<Line> {
  if (!id) return `${WARN} ${label} : non configure`;
  let channel: GuildBasedChannel | null = null;
  try {
    channel = await guild.channels.fetch(id);
  } catch {
    channel = null;
  }
  if (!channel) return `${FAIL} ${label} : salon introuvable (${id})`;

  const me = guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms) return `${WARN} ${label} : #${channel.name} (permissions inconnues)`;

  const missing = needs.filter((flag) => !perms.has(flag));
  if (missing.length > 0) {
    const names = missing.map((f) => new PermissionsBitField(f).toArray()[0]).join(', ');
    return `${FAIL} ${label} : #${channel.name} — permissions manquantes : ${names}`;
  }
  return `${OK} ${label} : #${channel.name}`;
}

async function messageLine(
  guild: Guild,
  label: string,
  channelId: string | null | undefined,
  messageId: string | null | undefined,
): Promise<Line> {
  if (!messageId) return `${WARN} ${label} : non cree`;
  if (!channelId) return `${WARN} ${label} : salon hote non configure`;
  try {
    const channel = await guild.channels.fetch(channelId);
    if (channel && 'messages' in channel) {
      await channel.messages.fetch(messageId);
      return `${OK} ${label} : present`;
    }
  } catch {
    return `${FAIL} ${label} : message introuvable (sera recree au demarrage)`;
  }
  return `${WARN} ${label} : verification impossible`;
}

const VIEW = PermissionsBitField.Flags.ViewChannel;
const SEND = PermissionsBitField.Flags.SendMessages;
const SEND_THREADS = PermissionsBitField.Flags.SendMessagesInThreads;
const MANAGE_THREADS = PermissionsBitField.Flags.ManageThreads;
const EMBED = PermissionsBitField.Flags.EmbedLinks;

export const diagnosticCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('hotzdoggz')
    .setDescription('Bot de gestion HotzDoggz')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('diagnostic')
        .setDescription('Verifie roles, salons, tags, permissions et messages permanents'),
    )
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.options.getSubcommand() !== 'diagnostic') return;
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: 'Cette commande doit etre utilisee dans un serveur.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = interaction.guild;

    const config = await prisma.guildConfig.findUnique({
      where: { guildId: guild.id },
      include: { gradeRates: true, forumTags: true },
    });

    const embed = new EmbedBuilder().setTitle('Diagnostic HotzDoggz').setColor(0xff7a00);

    if (!config) {
      embed
        .setColor(0xcc0000)
        .setDescription(
          `${FAIL} Aucune configuration enregistree pour ce serveur.\n` +
            'Renseigne les IDs (roles, salons, tags) puis lance le seed ' +
            '(`npm run db:seed`) ou la future commande de configuration.',
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Roles
    const roles: Line[] = [
      roleLine(guild, 'Directeur', config.roleDirecteur),
      roleLine(guild, 'Co-directeur', config.roleCoDirecteur),
      roleLine(guild, "Chef d'equipe", config.roleChefEquipe),
      roleLine(guild, 'Experimente', config.roleExperimente),
      roleLine(guild, 'Novice', config.roleNovice),
      roleLine(guild, 'Stagiaire', config.roleStagiaire),
      roleLine(guild, 'Client (visiteurs)', config.roleClient),
    ];

    // Salons
    const channels: Line[] = await Promise.all([
      channelLine(guild, 'Forum controle', config.channelControl, [
        VIEW,
        SEND_THREADS,
        MANAGE_THREADS,
        EMBED,
      ]),
      channelLine(guild, 'Comptabilite', config.channelAccounting, [VIEW, SEND, EMBED]),
      channelLine(guild, 'Paies', config.channelPayroll, [VIEW, SEND, EMBED]),
      channelLine(guild, 'Logs & archives', config.channelLogs, [VIEW, SEND, EMBED]),
      channelLine(guild, 'Tableau hebdo', config.channelWeeklyBoard, [VIEW, SEND, EMBED]),
      channelLine(guild, 'Developpement (employes)', config.channelCompanyBoard, [
        VIEW,
        SEND,
        EMBED,
      ]),
      channelLine(guild, 'Commandes (direction)', config.channelOrders, [VIEW, SEND, EMBED]),
      channelLine(guild, 'Avis clients (public)', config.channelReviews, [VIEW, SEND, EMBED]),
      channelLine(guild, 'Partenariats (employes)', config.channelPartnerships, [
        VIEW,
        SEND,
        EMBED,
      ]),
      channelLine(guild, 'Guide direction', config.channelGuideDirection, [VIEW, SEND, EMBED]),
      channelLine(guild, 'Accueil (arrivants)', config.channelWelcome, [VIEW, SEND, EMBED]),
      channelLine(guild, 'Règlement (sas)', config.channelReglement, [VIEW, SEND, EMBED]),
      channelLine(guild, 'Menu & tarifs (public)', config.channelMenuBoard, [VIEW, SEND, EMBED]),
      channelLine(guild, 'Événement (vitrine)', config.channelEvent, [VIEW, SEND, EMBED]),
      channelLine(guild, 'Prime (employés)', config.channelBonusBoard, [VIEW, SEND, EMBED]),
      channelLine(guild, 'Planning (employés)', config.channelPlanning, [VIEW, SEND, EMBED]),
    ]);

    // Tarifs de grade
    const activeRates = config.gradeRates.filter((r) => r.validTo === null);
    const ratesLine =
      activeRates.length > 0
        ? activeRates
            .sort((a, b) => a.ratePerUnit - b.ratePerUnit)
            .map((r) => `${OK} ${r.label} : ${r.ratePerUnit} $/u`)
            .join('\n')
        : `${WARN} Aucun tarif de grade actif enregistre`;

    // Casiers (Forums employes) et leurs tags
    const lockers = await prisma.employee.findMany({
      where: { guildConfigId: config.id, status: 'ACTIVE', NOT: { casierForumId: null } },
      select: { casierForumId: true },
    });
    const lockerCount = lockers.length;
    const taggedForums = new Set(config.forumTags.map((t) => t.forumChannelId));
    const lockersLine =
      lockerCount === 0
        ? `${WARN} Aucun casier actif associe`
        : `${OK} ${lockerCount} casier(s) actif(s) — ${taggedForums.size} Forum(s) avec tags mappes`;

    // Messages permanents
    const messages: Line[] = await Promise.all([
      messageLine(guild, 'Tableau employes', config.channelWeeklyBoard, config.msgWeeklyEmployees),
      messageLine(guild, 'Tableau comptable', config.channelAccounting, config.msgAccounting),
      messageLine(guild, 'Tableau paies', config.channelPayroll, config.msgPayroll),
      messageLine(guild, 'Grille salariale', config.channelWeeklyBoard, config.msgSalaryGrid),
      messageLine(
        guild,
        'Developpement entreprise',
        config.channelCompanyBoard ?? config.channelWeeklyBoard,
        config.msgCompanyBoard,
      ),
      messageLine(guild, 'Commandes a realiser', config.channelOrders, config.msgOrdersBoard),
      messageLine(guild, 'Bandeau avis clients', config.channelReviews, config.msgReviewBoard),
      messageLine(
        guild,
        'Objectifs partenariats',
        config.channelPartnerships ?? config.channelCompanyBoard ?? config.channelWeeklyBoard,
        config.msgPartnershipBoard,
      ),
      messageLine(guild, 'Sas règlement (bouton)', config.channelReglement, config.msgVerification),
      messageLine(guild, 'Menu & tarifs (public)', config.channelMenuBoard, config.msgMenuBoard),
      messageLine(guild, 'Vitrine événement', config.channelEvent, config.msgEventBoard),
      messageLine(guild, 'Tableau prime', config.channelBonusBoard, config.msgBonusBoard),
      messageLine(guild, 'Agenda planning', config.channelPlanning, config.msgPlanningBoard),
    ]);

    // Semaine comptable ouverte
    const openWeek = await prisma.accountingWeek.findFirst({
      where: { guildConfigId: config.id, status: 'OPEN' },
    });
    const weekLine = openWeek
      ? `${OK} Semaine ouverte depuis le ${openWeek.startAt.toISOString().slice(0, 10)}`
      : `${WARN} Aucune semaine comptable ouverte (\`/semaine ouvrir\`)`;

    embed.addFields(
      { name: 'Roles', value: roles.join('\n') },
      { name: 'Salons', value: channels.join('\n') },
      { name: 'Tarifs de grade', value: ratesLine },
      { name: 'Casiers', value: lockersLine },
      { name: 'Messages permanents', value: messages.join('\n') },
      { name: 'Semaine comptable', value: weekLine },
    );

    const hasFail = [...roles, ...channels, ...messages].some((l) => l.startsWith(FAIL));
    embed.setColor(hasFail ? 0xcc0000 : 0x2ecc71);

    logger.info({ guildId: guild.id, hasFail }, 'Diagnostic execute');
    await interaction.editReply({ embeds: [embed] });
  },
};
