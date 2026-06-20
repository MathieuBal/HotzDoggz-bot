import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { openWeek } from '../../modules/accounting/accountingService.js';
import { updateDashboardsNow } from '../../modules/dashboards/scheduler.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { PanelButtonId } from '../components/ids.js';
import { buildPanelMessage } from '../panel/overview.js';
import { isDirectionMember } from '../permissions.js';

const KNOWN = new Set<string>(Object.values(PanelButtonId));

/** @returns true si l'interaction a ete prise en charge ici. */
export async function handlePanelButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!KNOWN.has(interaction.customId)) return false;

  const ephemeral = MessageFlags.Ephemeral;
  if (!interaction.guild) {
    await interaction.reply({ content: 'Serveur requis.', flags: ephemeral });
    return true;
  }
  const config = await getGuildConfigByGuildId(interaction.guild.id);
  if (!config || !(await isDirectionMember(interaction.guild, interaction.user.id, config))) {
    await interaction.reply({ content: 'Réservé à la direction.', flags: ephemeral });
    return true;
  }

  if (interaction.customId === PanelButtonId.OPEN_WEEK) {
    const res = await openWeek(config.id, interaction.guild.id, config.timezone);
    if (!res.ok) {
      await interaction.reply({ content: `Échec : ${res.reason}`, flags: ephemeral });
      return true;
    }
    await updateDashboardsNow(interaction.client, config.id).catch(() => undefined);
  }

  // OPEN_WEEK et REFRESH : on rafraichit le panneau.
  await interaction.update(await buildPanelMessage(config.id));
  return true;
}
