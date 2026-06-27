import { Events, MessageFlags, type Client, type Interaction } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../../infrastructure/logging/logger.js';
import { handleDirectSaleButton } from '../buttons/directSaleButtons.js';
import { handlePanelButton } from '../buttons/panelButtons.js';
import { handlePanelConfirmButton } from '../buttons/panelConfirm.js';
import { handleReviewButton } from '../buttons/reviewButtons.js';
import { handleSaleButton } from '../buttons/saleButtons.js';
import { handleWeekButton } from '../buttons/weekButtons.js';
import { commands } from '../commands/index.js';
import { handleDirectSaleModal } from '../modals/directSaleModalHandlers.js';
import { handlePanelModal } from '../modals/panelModalHandlers.js';
import { handleReviewModal } from '../modals/reviewModalHandlers.js';
import { handleSaleModal } from '../modals/saleModalHandlers.js';
import { handleWeekModal } from '../modals/weekModalHandlers.js';
import {
  handleGarageAssign,
  handleGarageOpen,
  handleGaragePick,
  handleGarageVehButton,
} from '../garage/garageHandlers.js';
import { handleStockModal, handleStockSelect } from '../stock/stockHandlers.js';
import { handlePanelPick } from '../panel/pickers.js';
import { handlePlanningSelect } from '../planning/planningSelect.js';
import { handlePayrollSelect } from '../payroll/payrollSelect.js';
import { handlePanelSelect } from '../selects/panelSelect.js';
import {
  handleVerificationButton,
  handleVerificationModal,
} from '../verification/verificationHandlers.js';
import { handleVitrineModal } from '../vitrine/vitrineHandlers.js';

/** Codes Discord d'interaction perdue : inutile (et impossible) d'y repondre. */
const EXPIRED_INTERACTION_CODES = new Set([
  10062, // Unknown interaction (token expire : >3 s sans accuse de reception)
  40060, // Interaction deja acquittee
]);

function isExpiredInteraction(err: unknown): boolean {
  const code = (err as { code?: number } | null)?.code;
  return code !== undefined && EXPIRED_INTERACTION_CODES.has(code);
}

async function notifyError(interaction: Interaction, correlationId: string): Promise<void> {
  if (!interaction.isRepliable()) return;
  const payload = {
    content:
      'Une erreur est survenue (rien n’a été enregistré). Réessaie ; si ça persiste, ' +
      `donne ce code à la direction : \`${correlationId.slice(0, 8)}\`.`,
    flags: MessageFlags.Ephemeral as const,
  };
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (err) {
    logger.error({ err }, 'Impossible de notifier l’utilisateur de l’erreur');
  }
}

/**
 * Routage des interactions (CDC Annexe A) : slash commands, boutons et modals
 * de la fiche de controle. Chaque branche est isolee par un try/catch avec
 * identifiant de correlation.
 */
export function registerInteractionCreate(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    const correlationId = randomUUID();
    const log = logger.child({ correlationId });

    try {
      if (interaction.isButton()) {
        if (await handleGarageVehButton(interaction)) return;
        if (await handleVerificationButton(interaction)) return;
        if (await handlePanelConfirmButton(interaction)) return;
        if (await handlePanelButton(interaction)) return;
        if (await handleReviewButton(interaction)) return;
        if (await handleDirectSaleButton(interaction)) return;
        if (await handleSaleButton(interaction)) return;
        await handleWeekButton(interaction);
        return;
      }
      if (interaction.isUserSelectMenu()) {
        await handleGarageAssign(interaction);
        return;
      }
      if (interaction.isStringSelectMenu()) {
        if (await handlePlanningSelect(interaction)) return;
        if (await handlePayrollSelect(interaction)) return;
        if (await handleStockSelect(interaction)) return;
        if (await handleGarageOpen(interaction)) return;
        if (await handleGaragePick(interaction)) return;
        if (await handlePanelPick(interaction)) return;
        await handlePanelSelect(interaction);
        return;
      }
      if (interaction.isModalSubmit()) {
        if (await handleVerificationModal(interaction)) return;
        if (await handleVitrineModal(interaction)) return;
        if (await handleStockModal(interaction)) return;
        if (await handlePanelModal(interaction)) return;
        if (await handleReviewModal(interaction)) return;
        if (await handleDirectSaleModal(interaction)) return;
        if (await handleSaleModal(interaction)) return;
        await handleWeekModal(interaction);
        return;
      }
      if (interaction.isAutocomplete()) {
        const command = commands.get(interaction.commandName);
        if (command?.autocomplete) await command.autocomplete(interaction);
        return;
      }
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) {
          log.warn({ commandName: interaction.commandName }, 'Commande inconnue');
          return;
        }
        await command.execute(interaction);
      }
    } catch (err) {
      // Interaction expiree/deja acquittee : on ne peut plus repondre, et tenter
      // de le faire ne ferait que lever un nouveau 10062. On logge en debug et on
      // s'arrete la (evite le bruit et un second appel API voue a l'echec).
      if (isExpiredInteraction(err)) {
        log.debug({ type: interaction.type }, 'Interaction expiree (ignoree)');
        return;
      }
      log.error({ err, type: interaction.type }, 'Erreur de traitement d’une interaction');
      await notifyError(interaction, correlationId);
    }
  });
}
