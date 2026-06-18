import { Collection } from 'discord.js';
import { diagnosticCommand } from './diagnostic.js';
import { employeCommand } from './employe.js';
import { macomptaCommand } from './macompta.js';
import { semaineCommand } from './semaine.js';
import { tableauCommand } from './tableau.js';
import type { SlashCommand } from './types.js';

const all: SlashCommand[] = [
  diagnosticCommand,
  employeCommand,
  macomptaCommand,
  semaineCommand,
  tableauCommand,
];

/** Registre nom -> commande, consulte par le handler interactionCreate. */
export const commands = new Collection<string, SlashCommand>();
for (const cmd of all) {
  commands.set(cmd.data.name, cmd);
}

/** Payloads JSON a enregistrer aupres de l'API Discord. */
export const commandData = all.map((c) => c.data);
