import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { PanelEditValue, PanelSelectId } from '../components/ids.js';
import {
  buildPanelMenuModal,
  buildPanelPartenaireModal,
  buildPanelSalaireModal,
} from '../modals/panelModals.js';
import { isDirectionMember } from '../permissions.js';

/** @returns true si l'interaction a ete prise en charge ici. */
export async function handlePanelSelect(
  interaction: StringSelectMenuInteraction,
): Promise<boolean> {
  if (interaction.customId !== PanelSelectId.EDIT) return false;

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

  switch (interaction.values[0]) {
    case PanelEditValue.SALAIRE:
      await interaction.showModal(buildPanelSalaireModal());
      return true;
    case PanelEditValue.MENU:
      await interaction.showModal(buildPanelMenuModal());
      return true;
    case PanelEditValue.PARTENAIRE:
      await interaction.showModal(buildPanelPartenaireModal());
      return true;
    default:
      await interaction.reply({ content: 'Option inconnue.', flags: ephemeral });
      return true;
  }
}
