import { Events, MessageFlags, type Client, type Interaction } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../../infrastructure/logging/logger.js';
import { handleSaleButton } from '../buttons/saleButtons.js';
import { commands } from '../commands/index.js';
import { handleSaleModal } from '../modals/saleModalHandlers.js';

async function notifyError(interaction: Interaction): Promise<void> {
  if (!interaction.isRepliable()) return;
  const payload = {
    content: 'Une erreur est survenue. Les details ont ete journalises.',
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
        await handleSaleButton(interaction);
        return;
      }
      if (interaction.isModalSubmit()) {
        await handleSaleModal(interaction);
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
      log.error({ err, type: interaction.type }, 'Erreur de traitement d’une interaction');
      await notifyError(interaction);
    }
  });
}
