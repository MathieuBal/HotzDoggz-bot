import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { buildPayrollList } from '../../modules/dashboards/embeds.js';
import {
  getEmployeeByDiscordId,
  getGuildConfigByGuildId,
} from '../../modules/employees/employeeService.js';
import { getLatestClosedPayrolls, markPayrollPaid } from '../../modules/payroll/payrollService.js';
import { publishPayrollBoard } from '../payroll/payrollBoard.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

const nf = new Intl.NumberFormat('fr-FR');

export const paieCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('paie')
    .setDescription('Paies hebdomadaires')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('voir').setDescription('Affiche les paies de la derniere semaine cloturee'),
    )
    .addSubcommand((s) =>
      s
        .setName('marquer-payee')
        .setDescription('Confirme le versement en jeu de la paie d’un employe')
        .addUserOption((o) => o.setName('membre').setDescription('Employe paye').setRequired(true)),
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
    const sub = interaction.options.getSubcommand();

    if (sub === 'voir') {
      const data = await getLatestClosedPayrolls(config.id);
      if (!data) {
        await interaction.editReply('Aucune semaine cloturee.');
        return;
      }
      const label = data.week.startAt.toISOString().slice(0, 10);
      await interaction.editReply({ embeds: [buildPayrollList(label, data.payrolls)] });
      return;
    }

    if (sub === 'marquer-payee') {
      const member = interaction.options.getUser('membre', true);
      const employee = await getEmployeeByDiscordId(member.id);
      if (!employee || employee.guildConfigId !== config.id) {
        await interaction.editReply('Aucun employe associe a ce membre.');
        return;
      }
      const result = await markPayrollPaid(
        config.id,
        employee.id,
        interaction.user.id,
        randomUUID(),
      );
      if (!result.ok) {
        await interaction.editReply(result.reason);
        return;
      }
      // Garde le tableau de paie permanent synchronise avec la commande.
      await publishPayrollBoard(interaction.client, config.id).catch(() => undefined);
      await interaction.editReply(
        `Paie de **${result.data.nomRP}** marquee payee : ${nf.format(result.data.totalAmount)} $.`,
      );
    }
  },
};
