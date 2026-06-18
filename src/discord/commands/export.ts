import {
  AttachmentBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { buildLatestWeekExport } from '../../modules/accounting/exportService.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import { prisma } from '../../infrastructure/database/client.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

export const exportCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('export')
    .setDescription('Exports comptables')
    .addSubcommand((s) =>
      s
        .setName('semaine')
        .setDescription('Exporte la derniere semaine cloturee (CSV ventes + paies)'),
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
        content: 'Action reservee a la direction.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await buildLatestWeekExport(config.id);
    if (!result) {
      await interaction.editReply('Aucune semaine cloturee a exporter.');
      return;
    }

    const files = result.files.map(
      (f) => new AttachmentBuilder(Buffer.from(f.content, 'utf8'), { name: f.name }),
    );
    await writeAudit(prisma, {
      guildConfigId: config.id,
      action: 'WEEK_EXPORTED',
      authorDiscordId: interaction.user.id,
      entityType: 'AccountingWeek',
      reason: result.weekLabel,
    });
    await interaction.editReply({
      content: `Export de la semaine du ${result.weekLabel} :`,
      files,
    });
  },
};
