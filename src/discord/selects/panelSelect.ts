import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { PanelEditValue, PanelSelectId } from '../components/ids.js';
import {
  buildPanelFraudeModal,
  buildPanelMenuModal,
  buildPanelOrderCreateModal,
  buildPanelPartnerCreateModal,
  buildPanelPeremptionModal,
  buildPanelPnjPriceModal,
  buildPanelRappelModal,
  buildPanelRepartitionModal,
} from '../modals/panelModals.js';
import {
  buildGradePicker,
  buildPartnerPicker,
  buildProductRemovePicker,
} from '../panel/pickers.js';
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
    // Actions a entite : on propose un menu de selection (plus de saisie a la main).
    case PanelEditValue.SALAIRE: {
      const row = await buildGradePicker(config.id);
      if (!row) {
        await interaction.reply({
          content: 'Aucun grade configuré. Lance `/config roles` d’abord.',
          flags: ephemeral,
        });
        return true;
      }
      await interaction.reply({ content: '💰 Quel grade ?', components: [row], flags: ephemeral });
      return true;
    }
    case PanelEditValue.PARTENAIRE: {
      const row = await buildPartnerPicker(config.id);
      if (!row) {
        await interaction.reply({
          content: 'Aucun partenaire. Crée-en un via « Créer un partenaire ».',
          flags: ephemeral,
        });
        return true;
      }
      await interaction.reply({ content: '🤝 Quel partenaire ?', components: [row], flags: ephemeral });
      return true;
    }
    case PanelEditValue.MENU_RETIRER: {
      const row = await buildProductRemovePicker(config.id);
      if (!row) {
        await interaction.reply({ content: 'Le menu est déjà vide.', flags: ephemeral });
        return true;
      }
      await interaction.reply({
        content: '🗑️ Quel produit retirer ?',
        components: [row],
        flags: ephemeral,
      });
      return true;
    }

    // Actions a saisie libre : modal direct.
    case PanelEditValue.MENU:
      await interaction.showModal(buildPanelMenuModal());
      return true;
    case PanelEditValue.PNJ_PRIX:
      await interaction.showModal(buildPanelPnjPriceModal());
      return true;
    case PanelEditValue.PARTENAIRE_CREER:
      await interaction.showModal(buildPanelPartnerCreateModal());
      return true;
    case PanelEditValue.COMMANDE_CREER:
      await interaction.showModal(buildPanelOrderCreateModal());
      return true;
    case PanelEditValue.REPARTITION:
      await interaction.showModal(buildPanelRepartitionModal(config));
      return true;
    case PanelEditValue.PEREMPTION:
      await interaction.showModal(buildPanelPeremptionModal(config));
      return true;
    case PanelEditValue.FRAUDE:
      await interaction.showModal(buildPanelFraudeModal(config));
      return true;
    case PanelEditValue.RAPPEL:
      await interaction.showModal(buildPanelRappelModal(config));
      return true;
    default:
      await interaction.reply({ content: 'Option inconnue.', flags: ephemeral });
      return true;
  }
}
