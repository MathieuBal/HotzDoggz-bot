import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { closeWeek } from '../../modules/accounting/closureService.js';
import { buildClosureSummary } from '../../modules/dashboards/embeds.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { finalizeClosure } from '../closure/finalize.js';
import { WeekButtonId } from '../components/ids.js';
import { isDirectionMember } from '../permissions.js';

const KNOWN = new Set<string>([WeekButtonId.CLOSE_CONFIRM, WeekButtonId.CLOSE_CANCEL]);

/** @returns true si l'interaction a ete prise en charge ici. */
export async function handleWeekButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!KNOWN.has(interaction.customId)) return false;
  if (!interaction.guild) {
    await interaction.reply({ content: 'Serveur requis.', flags: MessageFlags.Ephemeral });
    return true;
  }

  if (interaction.customId === WeekButtonId.CLOSE_CANCEL) {
    await interaction.update({ content: 'Cloture annulee.', embeds: [], components: [] });
    return true;
  }

  const config = await getGuildConfigByGuildId(interaction.guild.id);
  if (!config) {
    await interaction.update({ content: 'Configuration absente.', components: [] });
    return true;
  }
  if (!(await isDirectionMember(interaction.guild, interaction.user.id, config))) {
    await interaction.reply({
      content: 'Action reservee a la direction.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.deferUpdate();
  const result = await closeWeek(config.id, interaction.user.id, { forced: false }, randomUUID());
  if (!result.ok) {
    await interaction.editReply({ content: result.reason, embeds: [], components: [] });
    return true;
  }
  const label = await finalizeClosure(interaction.client, config.id, result.data);
  await interaction.editReply({
    content: 'Semaine cloturee.',
    embeds: [buildClosureSummary(result.data, label)],
    components: [],
  });
  return true;
}
