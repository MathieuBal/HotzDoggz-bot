import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import {
  getOpenWeek,
  getOpenWeekSnapshot,
  openWeek,
} from '../../modules/accounting/accountingService.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import { buildAccountingBoard, buildEmployeeBoard } from '../../modules/dashboards/embeds.js';
import { updateDashboardsNow } from '../../modules/dashboards/scheduler.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { reconcileActiveThreads } from '../../modules/sales/reconcile.js';
import { WeekButtonId } from '../components/ids.js';
import { buildForceCloseModal } from '../modals/weekModals.js';
import { isDirecteurMember, isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

export const semaineCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('semaine')
    .setDescription('Gestion de la semaine comptable')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('ouvrir').setDescription('Ouvre une semaine comptable si aucune n’est ouverte'),
    )
    .addSubcommand((s) =>
      s.setName('voir').setDescription('Affiche le rapport de la semaine ouverte'),
    )
    .addSubcommand((s) =>
      s
        .setName('cloturer')
        .setDescription('Cloture la semaine (apercu + confirmation, mode strict)'),
    )
    .addSubcommand((s) =>
      s
        .setName('cloturer-force')
        .setDescription('Cloture forcee malgre des ventes en cours (Directeur uniquement)'),
    )
    .addSubcommand((s) =>
      s
        .setName('reset')
        .setDescription('Supprime la semaine ouverte et ses ventes (tests, Directeur uniquement)'),
    )
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({ content: 'Serveur requis.', flags: MessageFlags.Ephemeral });
      return;
    }
    const config = await getGuildConfigByGuildId(interaction.guild.id);
    if (!config) {
      await interaction.reply({
        content: 'Configuration absente. Lance le seed d’abord.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    // Cloture forcee : modal (pas de defer avant showModal).
    if (sub === 'cloturer-force') {
      if (
        !(await isDirecteurMember(interaction.guild, interaction.user.id, config.roleDirecteur))
      ) {
        await interaction.reply({
          content: 'Cloture forcee reservee au Directeur.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (!(await getOpenWeek(config.id))) {
        await interaction.reply({
          content: 'Aucune semaine ouverte.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.showModal(buildForceCloseModal());
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

    if (sub === 'ouvrir') {
      const result = await openWeek(config.id, interaction.guild.id, config.timezone);
      if (!result.ok || !result.week) {
        await interaction.editReply(result.reason ?? 'Echec.');
        return;
      }
      await writeAudit(prisma, {
        guildConfigId: config.id,
        action: 'WEEK_OPENED',
        authorDiscordId: interaction.user.id,
        entityType: 'AccountingWeek',
        entityId: result.week.id,
      });
      await reconcileActiveThreads(interaction.client).catch((err) =>
        logger.warn({ err }, 'Reconciliation post-ouverture KO'),
      );
      await updateDashboardsNow(interaction.client, config.id).catch((err) =>
        logger.warn({ err }, 'Publication des tableaux KO'),
      );
      const fmt = (d: Date): string => d.toLocaleDateString('fr-FR', { timeZone: config.timezone });
      await interaction.editReply(
        `Semaine ouverte : du ${fmt(result.week.startAt)} au ${fmt(result.week.endAt)}.`,
      );
      logger.info({ weekId: result.week.id }, 'Semaine ouverte');
      return;
    }

    if (sub === 'voir') {
      const snapshot = await getOpenWeekSnapshot(config.id);
      if (!snapshot) {
        await interaction.editReply('Aucune semaine ouverte.');
        return;
      }
      await interaction.editReply({
        embeds: [
          buildEmployeeBoard(snapshot.report, snapshot.week.startAt, snapshot.week.endAt),
          buildAccountingBoard(
            snapshot.report,
            snapshot.week.startAt,
            snapshot.week.endAt,
            snapshot.pendingCount,
          ),
        ],
      });
      return;
    }

    if (sub === 'cloturer') {
      const snapshot = await getOpenWeekSnapshot(config.id);
      if (!snapshot) {
        await interaction.editReply('Aucune semaine ouverte.');
        return;
      }
      if (snapshot.pendingCount > 0) {
        await interaction.editReply(
          `Cloture refusee : ${snapshot.pendingCount} vente(s) encore en cours (a verifier / a completer). ` +
            'Traite-les, ou utilise `/semaine cloturer-force` (Directeur).',
        );
        return;
      }
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(WeekButtonId.CLOSE_CONFIRM)
          .setLabel('Confirmer la cloture')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(WeekButtonId.CLOSE_CANCEL)
          .setLabel('Annuler')
          .setStyle(ButtonStyle.Secondary),
      );
      await interaction.editReply({
        content: 'Apercu de la cloture — verifie puis confirme :',
        embeds: [
          buildAccountingBoard(
            snapshot.report,
            snapshot.week.startAt,
            snapshot.week.endAt,
            snapshot.pendingCount,
          ),
        ],
        components: [row],
      });
      return;
    }

    if (sub === 'reset') {
      if (
        !(await isDirecteurMember(interaction.guild, interaction.user.id, config.roleDirecteur))
      ) {
        await interaction.editReply('Reinitialisation reservee au Directeur.');
        return;
      }
      if (!(await getOpenWeek(config.id))) {
        await interaction.editReply('Aucune semaine ouverte a reinitialiser.');
        return;
      }
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(WeekButtonId.RESET_CONFIRM)
          .setLabel('Supprimer la semaine')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(WeekButtonId.RESET_CANCEL)
          .setLabel('Annuler')
          .setStyle(ButtonStyle.Secondary),
      );
      await interaction.editReply({
        content:
          '⚠️ **Action irreversible.** Cela supprime la semaine ouverte et **toutes** ses ' +
          'ventes, preuves et paies (la configuration et les employes sont conserves). ' +
          'Pense aussi a supprimer les posts de test dans les casiers, sinon ils seront ' +
          're-detectes a la prochaine ouverture.',
        components: [row],
      });
    }
  },
};
