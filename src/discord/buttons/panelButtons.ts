import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { openWeek } from '../../modules/accounting/accountingService.js';
import { closeWeek } from '../../modules/accounting/closureService.js';
import { updateDashboardsNow } from '../../modules/dashboards/scheduler.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { finalizeClosure } from '../closure/finalize.js';
import { PanelButtonId } from '../components/ids.js';
import { buildPanelMessage } from '../panel/overview.js';
import { isDirectionMember } from '../permissions.js';

const KNOWN = new Set<string>(Object.values(PanelButtonId));

/** @returns true si l'interaction a ete prise en charge ici. */
export async function handlePanelButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!KNOWN.has(interaction.customId)) return false;

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

  let notice: string | null = null;

  if (interaction.customId === PanelButtonId.OPEN_WEEK) {
    const res = await openWeek(config.id, interaction.guild.id, config.timezone);
    if (!res.ok) {
      await interaction.reply({ content: `Échec : ${res.reason}`, flags: ephemeral });
      return true;
    }
    await updateDashboardsNow(interaction.client, config.id).catch(() => undefined);
    notice = '📅 Semaine ouverte.';
  }

  if (interaction.customId === PanelButtonId.CLOSE_WEEK) {
    // Cloture stricte (refusee s'il reste des ventes en attente) ; reversible
    // via /gestion rouvrir-semaine.
    const res = await closeWeek(config.id, interaction.user.id, { forced: false }, randomUUID());
    if (!res.ok) {
      await interaction.reply({ content: `Échec : ${res.reason}`, flags: ephemeral });
      return true;
    }
    await finalizeClosure(interaction.client, config.id, res.data);
    notice = `🔒 Semaine clôturée — CA ${res.data.totalRevenue} $, ${res.data.payrollCount} fiche(s) de paie.`;
  }

  if (interaction.customId === PanelButtonId.REFRESH_BOARDS) {
    await updateDashboardsNow(interaction.client, config.id).catch(() => undefined);
    notice = '📊 Tableaux rafraîchis.';
  }

  // Rafraichit le panneau, puis confirme (le cas echeant) en ephemere.
  await interaction.update(await buildPanelMessage(config.id));
  if (notice) await interaction.followUp({ content: notice, flags: ephemeral });
  return true;
}
