import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { getStaffCard } from '../../modules/employees/staffService.js';
import { publishStaffBoard } from '../staff/staffBoard.js';
import { buildStaffCard } from '../staff/staffCard.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

/**
 * Acces direct a la gestion des employes (direction). Sans argument : (re)publie
 * le trombinoscope permanent. Avec un membre : ouvre sa carte detaillee (utile
 * au-dela du menu du tableau, plafonne a 25).
 */
export const staffCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Gestion des employés (direction)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((o) =>
      o.setName('membre').setDescription('Ouvrir la carte détaillée de ce membre').setRequired(false),
    )
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const ephemeral = MessageFlags.Ephemeral;
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({ content: 'Serveur requis.', flags: ephemeral });
      return;
    }
    const config = await getGuildConfigByGuildId(interaction.guild.id);
    if (!config) {
      await interaction.reply({ content: 'Configuration absente.', flags: ephemeral });
      return;
    }
    if (!(await isDirection(interaction, config))) {
      await interaction.reply({ content: 'Action réservée à la direction.', flags: ephemeral });
      return;
    }

    await interaction.deferReply({ flags: ephemeral });
    const target = interaction.options.getUser('membre');

    // Sans membre : (re)publie le trombinoscope permanent.
    if (!target) {
      if (!config.channelStaff) {
        await interaction.editReply(
          'Aucun salon de gestion configuré. Lie-le avec `/config salons gestion:#…`.',
        );
        return;
      }
      await publishStaffBoard(interaction.client, config.id);
      await interaction.editReply(`✅ Trombinoscope publié/actualisé dans <#${config.channelStaff}>.`);
      return;
    }

    const employee = await prisma.employee.findUnique({
      where: { discordUserId: target.id },
      select: { id: true, guildConfigId: true },
    });
    if (!employee || employee.guildConfigId !== config.id) {
      await interaction.editReply(`Aucun employé associé à <@${target.id}> (\`/employe associer\`).`);
      return;
    }

    const card = await getStaffCard(interaction.guild, config.id, employee.id);
    if (!card) {
      await interaction.editReply('Employé introuvable.');
      return;
    }
    await interaction.editReply(buildStaffCard(card));
  },
};
