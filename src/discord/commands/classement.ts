import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getOpenWeek } from '../../modules/accounting/accountingService.js';
import {
  formatLeaderboard,
  getTopSellers,
} from '../../modules/accounting/leaderboardService.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import type { SlashCommand } from './types.js';

export const classementCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('classement')
    .setDescription('Classement des vendeurs de la semaine en cours')
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

    await interaction.deferReply();
    const week = await getOpenWeek(config.id);
    if (!week) {
      await interaction.editReply('Aucune semaine ouverte pour le moment.');
      return;
    }

    const top = await getTopSellers(config.id, 10, week.id);
    const embed = new EmbedBuilder()
      .setTitle('🏆 Classement de la semaine')
      .setColor(0xf1c40f)
      .setDescription(formatLeaderboard(top))
      .setFooter({
        text: 'Ventes PNJ validées cette semaine. Le classement all-time est dans le salon palmarès. 🌭',
      })
      .setTimestamp(new Date());
    await interaction.editReply({ embeds: [embed] });
  },
};
