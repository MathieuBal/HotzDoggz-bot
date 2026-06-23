import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import {
  getEmployeeByDiscordId,
  getGuildConfigByGuildId,
} from '../../modules/employees/employeeService.js';
import { toggleSignup } from '../../modules/planning/planningService.js';
import { PlanningSelectId } from '../components/ids.js';
import { publishPlanningBoard } from './planningBoard.js';

/** Menu « Je me positionne » de l'agenda planning. @returns true si gere ici. */
export async function handlePlanningSelect(
  interaction: StringSelectMenuInteraction,
): Promise<boolean> {
  if (interaction.customId !== PlanningSelectId.SIGNUP) return false;

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
  const employee = await getEmployeeByDiscordId(interaction.user.id);
  if (!employee || employee.guildConfigId !== config.id || employee.status !== 'ACTIVE') {
    await interaction.reply({
      content: 'Tu n’es pas enregistré comme employé actif.',
      flags: ephemeral,
    });
    return true;
  }

  const orderId = interaction.values[0];
  if (!orderId) {
    await interaction.reply({ content: 'Sélection vide.', flags: ephemeral });
    return true;
  }

  const res = await toggleSignup(config.id, orderId, employee.id);
  if (!res.ok) {
    await interaction.reply({ content: `❌ ${res.reason}`, flags: ephemeral });
    return true;
  }

  // Rafraichit l'agenda (la liste des positionnes change).
  await publishPlanningBoard(interaction.client, config.id).catch(() => undefined);

  await interaction.reply({
    content: res.positioned
      ? `✅ Tu t’es positionné sur **${res.reference}**. Pense à produire puis fais valider via \`/commande contribuer\`.`
      : `↩️ Tu t’es retiré de **${res.reference}**.`,
    flags: ephemeral,
  });
  return true;
}
