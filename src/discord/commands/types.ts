import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

/** Contrat commun a toutes les slash commands du bot. */
export interface SlashCommand {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  /** Optionnel : completion automatique des options (ex. noms de produits). */
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
