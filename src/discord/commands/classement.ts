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
    .setDescription('Classement des meilleurs vendeurs (ventes PNJ)')
    .addSubcommand((s) =>
      s.setName('global').setDescription('Classement all-time (depuis toujours)'),
    )
    .addSubcommand((s) =>
      s.setName('semaine').setDescription('Classement de la semaine en cours'),
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

    await interaction.deferReply();
    const weekly = interaction.options.getSubcommand() === 'semaine';

    let weekId: string | undefined;
    if (weekly) {
      const week = await getOpenWeek(config.id);
      if (!week) {
        await interaction.editReply('Aucune semaine ouverte pour le moment.');
        return;
      }
      weekId = week.id;
    }

    const top = await getTopSellers(config.id, 10, weekId);
    const embed = new EmbedBuilder()
      .setTitle(weekly ? '🏆 Classement de la semaine' : '🏆 Classement all-time — HotzDoggz')
      .setColor(0xf1c40f)
      .setDescription(formatLeaderboard(top))
      .setFooter({
        text: weekly
          ? 'Ventes PNJ validées cette semaine. Nouvelle semaine, nouvelle chance ! 🌭'
          : 'Ventes PNJ validées depuis toujours. À toi de grimper ! 🌭',
      })
      .setTimestamp(new Date());
    await interaction.editReply({ embeds: [embed] });
  },
};
