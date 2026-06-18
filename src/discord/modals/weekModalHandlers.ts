import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { closeWeek } from '../../modules/accounting/closureService.js';
import { buildClosureSummary } from '../../modules/dashboards/embeds.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { finalizeClosure } from '../closure/finalize.js';
import { FORCE_CLOSE_WORD, WeekFieldId, WeekModalId } from '../components/ids.js';
import { isDirecteurMember } from '../permissions.js';

/** @returns true si l'interaction a ete prise en charge ici. */
export async function handleWeekModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId !== WeekModalId.FORCE_CLOSE) return false;

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
  if (!(await isDirecteurMember(interaction.guild, interaction.user.id, config.roleDirecteur))) {
    await interaction.reply({
      content: 'Cloture forcee reservee au Directeur.',
      flags: ephemeral,
    });
    return true;
  }

  const reason = interaction.fields.getTextInputValue(WeekFieldId.REASON).trim();
  const confirm = interaction.fields.getTextInputValue(WeekFieldId.CONFIRM).trim();
  if (confirm !== FORCE_CLOSE_WORD) {
    await interaction.reply({
      content: `Confirmation invalide : tape exactement ${FORCE_CLOSE_WORD}.`,
      flags: ephemeral,
    });
    return true;
  }
  if (!reason) {
    await interaction.reply({ content: 'Motif obligatoire.', flags: ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: ephemeral });
  const result = await closeWeek(
    config.id,
    interaction.user.id,
    { forced: true, reason },
    randomUUID(),
  );
  if (!result.ok) {
    await interaction.editReply(result.reason);
    return true;
  }
  const label = await finalizeClosure(interaction.client, config.id, result.data);
  await interaction.editReply({ embeds: [buildClosureSummary(result.data, label)] });
  return true;
}
