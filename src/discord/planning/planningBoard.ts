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
import { computeIsoWeekBounds } from '../../modules/accounting/week.js';
import { getPlanningOrders, type PlanningOrder } from '../../modules/planning/planningService.js';
import { PlanningSelectId } from '../components/ids.js';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function fmtDay(d: Date, tz: string): string {
  return d.toLocaleDateString('fr-FR', { timeZone: tz, day: '2-digit', month: '2-digit' });
}

/** Petite barre de progression (10 segments). */
function bar(done: number, target: number): string {
  if (target <= 0) return '▱▱▱▱▱▱▱▱▱▱';
  const filled = Math.max(0, Math.min(10, Math.round((done / target) * 10)));
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}

function orderLine(o: PlanningOrder): string {
  const head = o.open ? '🟡' : '📦';
  const prog = `${bar(o.producedQuantity, o.targetQuantity)} ${o.producedQuantity}/${o.targetQuantity} u`;
  const who =
    o.signups.length > 0 ? `✋ ${o.signups.join(', ')}` : o.open ? '✋ _personne — positionne-toi !_' : '';
  return `${head} **${o.reference}** — ${o.clientName}\n${prog}${who ? `\n${who}` : ''}`;
}

/** Construit l'agenda de la semaine (embed) + le menu de positionnement. */
export async function buildPlanningMessage(guildConfigId: string): Promise<BaseMessageOptions> {
  const config = await prisma.guildConfig.findUnique({
    where: { id: guildConfigId },
    select: { timezone: true },
  });
  const tz = config?.timezone ?? 'Europe/Paris';
  const orders = await getPlanningOrders(guildConfigId);
  const { startAt, endAt } = computeIsoWeekBounds(new Date(), tz);

  const embed = new EmbedBuilder()
    .setTitle('🗓️ Planning de la semaine')
    .setColor(0x2e86de)
    .setDescription(`Du ${fmtDay(startAt, tz)} au ${fmtDay(endAt, tz)}`)
    .setTimestamp(new Date());

  if (orders.length === 0) {
    embed.addFields({
      name: 'Aucune commande en cours',
      value: '_Rien à produire pour l’instant. Profitez-en pour vendre au PNJ ! 🌭_',
    });
    return { embeds: [embed], components: [] };
  }

  // Repartition par jour de la semaine en cours + retard + sans date / plus tard.
  const overdue: PlanningOrder[] = [];
  const later: PlanningOrder[] = [];
  const undated: PlanningOrder[] = [];
  const byDay = new Map<number, PlanningOrder[]>();
  const now = new Date();
  for (const o of orders) {
    if (!o.deadline) {
      undated.push(o);
    } else if (o.deadline < startAt && o.deadline < now) {
      overdue.push(o);
    } else if (o.deadline > endAt) {
      later.push(o);
    } else {
      // jour 0 (lundi) .. 6 (dimanche)
      const day = (o.deadline.getDay() + 6) % 7;
      (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(o);
    }
  }

  if (overdue.length > 0) {
    embed.addFields({ name: '⚠️ En retard', value: overdue.map(orderLine).join('\n\n') });
  }
  for (let d = 0; d < 7; d++) {
    const items = byDay.get(d);
    if (items && items.length > 0) {
      const dayDate = new Date(startAt.getTime() + d * 86_400_000);
      embed.addFields({
        name: `📅 ${DAYS[d]} ${fmtDay(dayDate, tz)}`,
        value: items.map(orderLine).join('\n\n'),
      });
    }
  }
  const rest = [...later, ...undated];
  if (rest.length > 0) {
    embed.addFields({ name: '📌 Plus tard / sans date', value: rest.map(orderLine).join('\n\n') });
  }

  embed.setFooter({
    text: 'Positionne-toi sur une commande ci-dessous. Production réelle : /commande contribuer',
  });

  // Menu de positionnement (commandes ouvertes uniquement).
  const open = orders.filter((o) => o.open).slice(0, 25);
  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  if (open.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(PlanningSelectId.SIGNUP)
      .setPlaceholder('✋ Je me positionne / me retire d’une commande…')
      .addOptions(
        open.map((o) => ({
          label: `${o.reference} — ${o.clientName}`.slice(0, 100),
          description: `${o.producedQuantity}/${o.targetQuantity} u`.slice(0, 100),
          value: o.id,
        })),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }

  return { embeds: [embed], components };
}

/** Publie / met a jour l'agenda planning dans son salon dedie. */
export async function publishPlanningBoard(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelPlanning) return;

  const channel = await client.channels.fetch(config.channelPlanning).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    logger.warn({ channelId: config.channelPlanning }, 'Salon planning introuvable');
    return;
  }
  const payload = await buildPlanningMessage(guildConfigId);

  if (config.msgPlanningBoard) {
    try {
      const msg = await (channel as TextBasedChannel).messages.fetch(config.msgPlanningBoard);
      await msg.edit(payload);
      return;
    } catch {
      /* message supprime -> on recree */
    }
  }
  const created = await channel.send(payload);
  await prisma.guildConfig.update({
    where: { id: guildConfigId },
    data: { msgPlanningBoard: created.id },
  });
}
