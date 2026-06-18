import { Client, GatewayIntentBits, Partials } from 'discord.js';

/**
 * Client Discord et intents (CDC §8.3 - principe de moindre privilege).
 *
 * Intents privilegies a activer dans le Developer Portal :
 *  - MessageContent : lire contenu et pieces jointes des posts employes ;
 *  - GuildMembers   : lire les roles/grades de façon fiable.
 * Sans activation cote portail, la connexion Gateway echoue.
 */
export function createDiscordClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers, // grades (privilegie)
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, // contenu/pieces jointes (privilegie)
    ],
    // Necessaire pour recevoir des entites partielles (threads/messages de Forum).
    partials: [Partials.Channel, Partials.Message, Partials.ThreadMember],
  });
}
