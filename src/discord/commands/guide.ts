import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { publishDirectionGuide } from '../guides/directionGuide.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

/** Publie / met a jour les guides tuto (direction). */
export const guideCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('guide')
    .setDescription('Publier les guides tuto (direction)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('direction').setDescription('Publier / mettre à jour le guide direction'),
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
    if (!(await isDirection(interaction, config))) {
      await interaction.reply({
        content: 'Réservé à la direction.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!config.channelGuideDirection) {
      await interaction.editReply(
        'Aucun salon de guide direction. Lie-le d’abord : `/config salons guide_direction:#…`.',
      );
      return;
    }
    await publishDirectionGuide(interaction.client, config.id);
    await interaction.editReply('✅ Guide direction publié / mis à jour.');
  },
};
