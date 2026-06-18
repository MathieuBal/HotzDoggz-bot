import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getOpenWeekSnapshot } from '../../modules/accounting/accountingService.js';
import { personalView } from '../../modules/accounting/weekReport.js';
import { buildPersonalBoard } from '../../modules/dashboards/embeds.js';
import {
  getEmployeeByDiscordId,
  getGuildConfigByGuildId,
} from '../../modules/employees/employeeService.js';
import type { SlashCommand } from './types.js';

/**
 * Fiche perso de suivi de compta (CDC §7.4). Tout employe peut consulter, en
 * prive, sa production, son salaire provisoire et son ecart au meilleur employe
 * (calcule hors direction/co-patron, pour motiver).
 */
export const macomptaCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('macompta')
    .setDescription('Ta compta de la semaine : production, salaire et ecart au meilleur employe')
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({ content: 'Serveur requis.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const config = await getGuildConfigByGuildId(interaction.guild.id);
    if (!config) {
      await interaction.editReply('Configuration absente.');
      return;
    }

    const employee = await getEmployeeByDiscordId(interaction.user.id);
    if (!employee || employee.guildConfigId !== config.id) {
      await interaction.editReply('Tu n’es pas enregistre comme employe.');
      return;
    }

    const snapshot = await getOpenWeekSnapshot(config.id);
    if (!snapshot) {
      await interaction.editReply('Aucune semaine comptable ouverte pour le moment.');
      return;
    }

    const view = personalView(snapshot.report, employee.id);
    await interaction.editReply({
      embeds: [
        buildPersonalBoard(employee.nomRP, view, snapshot.week.startAt, snapshot.week.endAt),
      ],
    });
  },
};
