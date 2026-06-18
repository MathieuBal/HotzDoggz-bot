import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { updateDashboardsNow } from '../../modules/dashboards/scheduler.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

export const tableauCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('tableau')
    .setDescription('Tableaux permanents du bot')
    .addSubcommand((s) =>
      s
        .setName('publier')
        .setDescription('Cree ou actualise les tableaux permanents dans leurs salons'),
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
        content: 'Configuration absente.',
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
    await updateDashboardsNow(interaction.client, config.id);
    await interaction.editReply('Tableaux publies / actualises.');
  },
};
