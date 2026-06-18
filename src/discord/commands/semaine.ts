import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { getOpenWeekSnapshot, openWeek } from '../../modules/accounting/accountingService.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import { prisma } from '../../infrastructure/database/client.js';
import { buildAccountingBoard, buildEmployeeBoard } from '../../modules/dashboards/embeds.js';
import { updateDashboardsNow } from '../../modules/dashboards/scheduler.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { reconcileActiveThreads } from '../../modules/sales/reconcile.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

export const semaineCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('semaine')
    .setDescription('Gestion de la semaine comptable')
    .addSubcommand((s) =>
      s.setName('ouvrir').setDescription('Ouvre une semaine comptable si aucune n’est ouverte'),
    )
    .addSubcommand((s) =>
      s.setName('voir').setDescription('Affiche le rapport de la semaine ouverte'),
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
    if (!(await isDirection(interaction, config))) {
      await interaction.reply({
        content: 'Action reservee a la direction.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();

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

      // Reprend les posts faits avant l'ouverture, puis publie les tableaux.
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
    }
  },
};
