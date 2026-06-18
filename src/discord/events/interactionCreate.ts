import { Events, MessageFlags, type Client, type Interaction } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../../infrastructure/logging/logger.js';
import { commands } from '../commands/index.js';

/**
 * Routage des interactions (CDC Annexe A : interactionCreate).
 * Phase 1 : slash commands. Boutons/selects/modals seront ajoutes en Phase 3.
 */
export function registerInteractionCreate(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) {
      logger.warn({ commandName: interaction.commandName }, 'Commande inconnue');
      return;
    }

    const correlationId = randomUUID();
    const log = logger.child({ correlationId, command: interaction.commandName });

    try {
      await command.execute(interaction);
    } catch (err) {
      log.error({ err }, 'Erreur lors de l’execution d’une commande');
      const payload = {
        content: 'Une erreur est survenue. Les details ont ete journalises.',
        flags: MessageFlags.Ephemeral as const,
      };
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      } catch (replyErr) {
        log.error({ err: replyErr }, 'Impossible de notifier l’utilisateur de l’erreur');
      }
    }
  });
}
