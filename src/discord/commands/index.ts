import { Collection } from 'discord.js';
import { GARAGE_STOCK_ENABLED } from '../../config/constants.js';
import { accesCommand } from './acces.js';
import { avanceCommand } from './avance.js';
import { classementCommand } from './classement.js';
import { commandeCommand } from './commande.js';
import { configCommand } from './config.js';
import { diagnosticCommand } from './diagnostic.js';
import { employeCommand } from './employe.js';
import { eventCommand } from './event.js';
import { exportCommand } from './export.js';
import { factureCommand } from './facture.js';
import { gestionCommand } from './gestion.js';
import { guideCommand } from './guide.js';
import { journalCommand } from './journal.js';
import { macomptaCommand } from './macompta.js';
import { menuCommand } from './menu.js';
import { paieCommand } from './paie.js';
import { panelCommand } from './panel.js';
import { partenaireCommand } from './partenaire.js';
import { profilCommand } from './profil.js';
import { semaineCommand } from './semaine.js';
import { stockCommand } from './stock.js';
import { tableauCommand } from './tableau.js';
import { tresorerieCommand } from './tresorerie.js';
import { vehiculeCommand } from './vehicule.js';
import { vendreCommand } from './vendre.js';
import { vitrineCommand } from './vitrine.js';
import type { SlashCommand } from './types.js';

const all: SlashCommand[] = [
  accesCommand,
  avanceCommand,
  classementCommand,
  commandeCommand,
  configCommand,
  diagnosticCommand,
  employeCommand,
  eventCommand,
  exportCommand,
  factureCommand,
  gestionCommand,
  guideCommand,
  journalCommand,
  macomptaCommand,
  menuCommand,
  paieCommand,
  panelCommand,
  partenaireCommand,
  profilCommand,
  semaineCommand,
  tableauCommand,
  tresorerieCommand,
  vendreCommand,
  vitrineCommand,
  // Module garage / stock mis de cote (cf. GARAGE_STOCK_ENABLED) : commandes
  // enregistrees uniquement si le module est reactive.
  ...(GARAGE_STOCK_ENABLED ? [stockCommand, vehiculeCommand] : []),
];

/** Registre nom -> commande, consulte par le handler interactionCreate. */
export const commands = new Collection<string, SlashCommand>();
for (const cmd of all) {
  commands.set(cmd.data.name, cmd);
}

/** Payloads JSON a enregistrer aupres de l'API Discord. */
export const commandData = all.map((c) => c.data);
