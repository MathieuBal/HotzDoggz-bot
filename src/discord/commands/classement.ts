import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  formatLeaderboard,
  getTopSellers,
} from '../../modules/accounting/leaderboardService.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import type { SlashCommand } from './types.js';

export const classementCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('classement')
    .setDescription('Classement des meilleurs vendeurs (ventes PNJ, all-time)')
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
    const top = await getTopSellers(config.id, 10);
    const embed = new EmbedBuilder()
      .setTitle('🏆 Classement des vendeurs — HotzDoggz')
      .setColor(0xf1c40f)
      .setDescription(formatLeaderboard(top))
      .setFooter({ text: 'Ventes au PNJ validées, depuis toujours. À toi de grimper ! 🌭' })
      .setTimestamp(new Date());
    await interaction.editReply({ embeds: [embed] });
  },
};
