import { Collection } from 'discord.js';
import { accesCommand } from './acces.js';
import { avanceCommand } from './avance.js';
import { commandeCommand } from './commande.js';
import { configCommand } from './config.js';
import { diagnosticCommand } from './diagnostic.js';
import { employeCommand } from './employe.js';
import { eventCommand } from './event.js';
import { exportCommand } from './export.js';
import { factureCommand } from './facture.js';
import { gestionCommand } from './gestion.js';
import { guideCommand } from './guide.js';
import { macomptaCommand } from './macompta.js';
import { menuCommand } from './menu.js';
import { paieCommand } from './paie.js';
import { panelCommand } from './panel.js';
import { partenaireCommand } from './partenaire.js';
import { semaineCommand } from './semaine.js';
import { tableauCommand } from './tableau.js';
import { vendreCommand } from './vendre.js';
import { vitrineCommand } from './vitrine.js';
import type { SlashCommand } from './types.js';

const all: SlashCommand[] = [
  accesCommand,
  avanceCommand,
  commandeCommand,
  configCommand,
  diagnosticCommand,
  employeCommand,
  eventCommand,
  exportCommand,
  factureCommand,
  gestionCommand,
  guideCommand,
  macomptaCommand,
  menuCommand,
  paieCommand,
  panelCommand,
  partenaireCommand,
  semaineCommand,
  tableauCommand,
  vendreCommand,
  vitrineCommand,
];

/** Registre nom -> commande, consulte par le handler interactionCreate. */
export const commands = new Collection<string, SlashCommand>();
for (const cmd of all) {
  commands.set(cmd.data.name, cmd);
}

/** Payloads JSON a enregistrer aupres de l'API Discord. */
export const commandData = all.map((c) => c.data);
