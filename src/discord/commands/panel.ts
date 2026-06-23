import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { buildPanelMessage } from '../panel/overview.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

/**
 * Panneau de gestion central (direction) : vue d'ensemble de tout (semaine,
 * commandes, partenaires, menu, grille) + edition rapide (menu deroulant) et
 * actions rapides (ouvrir la semaine, rafraichir).
 */
export const panelCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Panneau de gestion central (direction)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
    const payload = await buildPanelMessage(config.id);
    await interaction.editReply(payload);
  },
};
