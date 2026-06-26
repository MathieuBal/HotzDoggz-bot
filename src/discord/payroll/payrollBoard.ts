import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type BaseMessageOptions,
  type Client,
  type TextBasedChannel,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { buildPayrollList } from '../../modules/dashboards/embeds.js';
import { getLatestClosedPayrolls, type PayrollLine } from '../../modules/payroll/payrollService.js';
import { PayrollSelectId } from '../components/ids.js';

/**
 * Tableau de paie permanent (salon paie). Affiche la liste des employes de la
 * derniere semaine cloturee avec le net a verser et le statut, et porte un menu
 * « Marquer payee » pour que la direction confirme chaque versement fait en jeu
 * sans quitter le salon. Le bot edite toujours le meme message (msgPayroll).
 */

const nf = new Intl.NumberFormat('fr-FR');
const net = (p: PayrollLine): number => Math.max(0, p.totalAmount - p.advancedAmount);

/** Menu « Marquer payee » : un choix par paie encore en attente (cap Discord 25). */
export function buildPayPickComponents(
  payrolls: readonly PayrollLine[],
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const pending = payrolls.filter((p) => p.status !== 'PAID');
  if (pending.length === 0) return [];

  const options = pending.slice(0, 25).map((p) => {
    const opt: { label: string; value: string; description?: string } = {
      label: `${p.employee.nomRP} — ${nf.format(net(p))} $`.slice(0, 100),
      value: p.employeeId,
    };
    if (p.advancedAmount > 0) {
      opt.description = `acompte ${nf.format(p.advancedAmount)} $ deja deduit`;
    }
    return opt;
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(PayrollSelectId.PAY)
    .setPlaceholder('✅ Marquer une paie réglée en jeu…')
    .addOptions(options);
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
}

function placeholder(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('💸 Paies')
    .setColor(0x95a5a6)
    .setDescription(
      'Aucune semaine clôturée pour le moment. Le tableau des paies apparaîtra ' +
        'à la première clôture (`/semaine cloturer`).',
    )
    .setTimestamp(new Date());
}

/** Construit le tableau de paie (embed + menu de paiement) du salon paie. */
export async function buildPayrollMessage(guildConfigId: string): Promise<BaseMessageOptions> {
  const data = await getLatestClosedPayrolls(guildConfigId);
  if (!data) return { embeds: [placeholder()], components: [] };
  const label = data.week.startAt.toISOString().slice(0, 10);
  return {
    embeds: [buildPayrollList(label, data.payrolls)],
    components: buildPayPickComponents(data.payrolls),
  };
}

/** Publie / met a jour le tableau de paie permanent dans le salon paie. */
export async function publishPayrollBoard(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelPayroll) return;

  const channel = await client.channels.fetch(config.channelPayroll).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    logger.warn({ channelId: config.channelPayroll }, 'Salon paie introuvable ou non textuel');
    return;
  }
  const payload = await buildPayrollMessage(guildConfigId);

  if (config.msgPayroll) {
    try {
      const msg = await (channel as TextBasedChannel).messages.fetch(config.msgPayroll);
      await msg.edit(payload);
      return;
    } catch {
      // message supprime -> on le recree (CDC §11 : dashboard supprime)
      logger.warn({ msgPayroll: config.msgPayroll }, 'Tableau paie absent — recreation');
    }
  }
  const created = await channel.send(payload);
  await prisma.guildConfig.update({
    where: { id: guildConfigId },
    data: { msgPayroll: created.id },
  });
}
