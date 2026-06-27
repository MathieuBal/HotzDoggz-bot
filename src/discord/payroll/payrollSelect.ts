import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { markPayrollPaid } from '../../modules/payroll/payrollService.js';
import { PayrollSelectId } from '../components/ids.js';
import { isDirectionMember } from '../permissions.js';
import { publishPayrollBoard } from './payrollBoard.js';

const nf = new Intl.NumberFormat('fr-FR');

/**
 * Menu « Marquer payee » du tableau de paie. Confirme le versement en jeu d'une
 * paie (sortie sur les fonds via markPayrollPaid), puis rafraichit le tableau.
 * @returns true si l'interaction est geree ici.
 */
export async function handlePayrollSelect(
  interaction: StringSelectMenuInteraction,
): Promise<boolean> {
  if (interaction.customId !== PayrollSelectId.PAY) return false;

  const ephemeral = MessageFlags.Ephemeral;
  if (!interaction.guild) {
    await interaction.reply({ content: 'Serveur requis.', flags: ephemeral });
    return true;
  }
  const config = await getGuildConfigByGuildId(interaction.guild.id);
  if (!config) {
    await interaction.reply({ content: 'Configuration absente.', flags: ephemeral });
    return true;
  }
  if (!(await isDirectionMember(interaction.guild, interaction.user.id, config))) {
    await interaction.reply({ content: 'Action réservée à la direction.', flags: ephemeral });
    return true;
  }

  const employeeId = interaction.values[0];
  if (!employeeId) {
    await interaction.reply({ content: 'Sélection vide.', flags: ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: ephemeral });
  const res = await markPayrollPaid(config.id, employeeId, interaction.user.id, randomUUID());
  if (!res.ok) {
    await interaction.editReply(res.reason);
    return true;
  }

  // Rafraichit le tableau : l'employe regle quitte la liste des paies en attente.
  await publishPayrollBoard(interaction.client, config.id).catch(() => undefined);
  await interaction.editReply(
    `✅ Paie de **${res.data.nomRP}** marquée réglée : ${nf.format(res.data.totalAmount)} $ versés depuis les fonds.`,
  );
  return true;
}
