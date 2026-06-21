import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { VitrineFieldId, VitrineModalId } from '../components/ids.js';
import { isDirection } from '../permissions.js';
import {
  DEFAULT_EVENT_BOARD,
  DEFAULT_WELCOME_BOARD,
} from '../vitrine/vitrineBoards.js';
import type { SlashCommand } from './types.js';

/** Edition des vitrines publiques (bienvenue, evenement) — direction. */
export const vitrineCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('vitrine')
    .setDescription('Modifier les vitrines publiques (direction)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('bienvenue').setDescription('Modifier le texte de la vitrine Bienvenue'),
    )
    .addSubcommand((s) =>
      s.setName('evenement').setDescription('Modifier le texte de la vitrine Événement'),
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
      await interaction.reply({ content: 'Réservé à la direction.', flags: MessageFlags.Ephemeral });
      return;
    }

    const isEvent = interaction.options.getSubcommand() === 'evenement';
    const current = isEvent
      ? (config.eventText ?? DEFAULT_EVENT_BOARD)
      : (config.welcomeBoardText ?? DEFAULT_WELCOME_BOARD);

    const modal = new ModalBuilder()
      .setCustomId(isEvent ? VitrineModalId.EVENT : VitrineModalId.WELCOME)
      .setTitle(isEvent ? 'Vitrine Événement' : 'Vitrine Bienvenue')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(VitrineFieldId.TEXT)
            .setLabel('Texte (le titre & le style sont automatiques)')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(4000)
            .setValue(current.slice(0, 4000))
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal);
  },
};
