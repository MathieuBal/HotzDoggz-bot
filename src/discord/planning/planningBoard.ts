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
import { listUpcomingEvents, type EventView } from '../../modules/events/eventService.js';
import { getPlanningOrders, type PlanningOrder } from '../../modules/planning/planningService.js';
import { PlanningSelectId } from '../components/ids.js';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function fmtDay(d: Date, tz: string): string {
  return d.toLocaleDateString('fr-FR', { timeZone: tz, day: '2-digit', month: '2-digit' });
}
function fmtTime(d: Date, tz: string): string {
  return d.toLocaleTimeString('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
}

/** Petite barre de progression (10 segments). */
function bar(done: number, target: number): string {
  if (target <= 0) return '▱▱▱▱▱▱▱▱▱▱';
  const filled = Math.max(0, Math.min(10, Math.round((done / target) * 10)));
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}

// Element unifie de l'agenda (commande ou evenement).
interface AgendaItem {
  date: Date | null; // echeance (commande) ou date (evenement)
  text: string;
  signupValue: string | null; // valeur du menu (o:<id> / e:<id>), null si non positionnable
}

function orderItem(o: PlanningOrder): AgendaItem {
  const prog = `${bar(o.producedQuantity, o.targetQuantity)} ${o.producedQuantity}/${o.targetQuantity} u`;
  const who =
    o.signups.length > 0 ? `✋ ${o.signups.join(', ')}` : o.open ? '✋ _personne — positionne-toi !_' : '';
  return {
    date: o.deadline,
    text: `${o.open ? '🟡' : '📦'} **Commande ${o.reference}** — ${o.clientName}\n${prog}${who ? `\n${who}` : ''}`,
    signupValue: o.open ? `o:${o.id}` : null,
  };
}

function eventItem(e: EventView, tz: string): AgendaItem {
  const parts = [`🎉 **${e.title}** — ${fmtTime(e.startAt, tz)}`];
  if (e.location) parts.push(`📍 ${e.location}`);
  if (e.ourRole) parts.push(`🎯 Notre rôle : ${e.ourRole}`);
  if (e.description) parts.push(e.description.length > 300 ? `${e.description.slice(0, 299)}…` : e.description);
  parts.push(e.signups.length > 0 ? `✋ ${e.signups.join(', ')}` : '✋ _personne — positionne-toi !_');
  return { date: e.startAt, text: parts.join('\n'), signupValue: `e:${e.id}` };
}

/** Construit l'agenda de la semaine (embed) + le menu de positionnement. */
export async function buildPlanningMessage(guildConfigId: string): Promise<BaseMessageOptions> {
  const config = await prisma.guildConfig.findUnique({
    where: { id: guildConfigId },
    select: { timezone: true },
  });
  const tz = config?.timezone ?? 'Europe/Paris';
  const [orders, events] = await Promise.all([
    getPlanningOrders(guildConfigId),
    listUpcomingEvents(guildConfigId),
  ]);
  const { startAt, endAt } = computeIsoWeekBounds(new Date(), tz);

  const embed = new EmbedBuilder()
    .setTitle('🗓️ Planning de la semaine')
    .setColor(0x2e86de)
    .setDescription(`Du ${fmtDay(startAt, tz)} au ${fmtDay(endAt, tz)}`)
    .setTimestamp(new Date());

  const items: AgendaItem[] = [...orders.map(orderItem), ...events.map((e) => eventItem(e, tz))];

  if (items.length === 0) {
    embed.addFields({
      name: 'Rien de prévu',
      value: '_Aucune commande ni événement. Profitez-en pour vendre au PNJ ! 🌭_',
    });
    return { embeds: [embed], components: [] };
  }

  // Repartition : retard / jours de la semaine en cours / plus tard / sans date.
  const overdue: AgendaItem[] = [];
  const later: AgendaItem[] = [];
  const undated: AgendaItem[] = [];
  const byDay = new Map<number, AgendaItem[]>();
  const now = new Date();
  for (const it of items) {
    if (!it.date) undated.push(it);
    else if (it.date < startAt && it.date < now) overdue.push(it);
    else if (it.date > endAt) later.push(it);
    else {
      const day = (it.date.getDay() + 6) % 7;
      const arr = byDay.get(day) ?? [];
      arr.push(it);
      byDay.set(day, arr);
    }
  }

  if (overdue.length > 0) {
    embed.addFields({ name: '⚠️ En retard', value: overdue.map((i) => i.text).join('\n\n') });
  }
  for (let d = 0; d < 7; d++) {
    const dayItems = byDay.get(d);
    if (dayItems && dayItems.length > 0) {
      const dayDate = new Date(startAt.getTime() + d * 86_400_000);
      embed.addFields({
        name: `📅 ${DAYS[d]} ${fmtDay(dayDate, tz)}`,
        value: dayItems.map((i) => i.text).join('\n\n'),
      });
    }
  }
  const rest = [...later, ...undated];
  if (rest.length > 0) {
    embed.addFields({ name: '📌 Plus tard / sans date', value: rest.map((i) => i.text).join('\n\n') });
  }

  embed.setFooter({
    text: 'Positionne-toi ci-dessous. Production des commandes : /commande contribuer',
  });

  // Menu de positionnement (commandes ouvertes + evenements).
  const positionable: { label: string; value: string }[] = [];
  for (const o of orders) {
    if (o.open) positionable.push({ label: `📦 ${o.reference} — ${o.clientName}`, value: `o:${o.id}` });
  }
  for (const e of events) {
    positionable.push({ label: `🎉 ${e.title}`.slice(0, 100), value: `e:${e.id}` });
  }

  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  if (positionable.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(PlanningSelectId.SIGNUP)
      .setPlaceholder('✋ Je me positionne / me retire…')
      .addOptions(positionable.slice(0, 25).map((p) => ({ label: p.label.slice(0, 100), value: p.value })));
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
