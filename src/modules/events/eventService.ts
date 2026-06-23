import { EventStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface EventView {
  id: string;
  title: string;
  startAt: Date;
  location: string | null;
  ourRole: string | null;
  description: string | null;
  signups: string[]; // nomRP des employes positionnes
}

export interface CreateEventInput {
  guildConfigId: string;
  title: string;
  startAt: Date;
  location: string | null;
  ourRole: string | null;
  description: string | null;
  createdByDiscordId: string;
}

/** Cree un evenement. */
export async function createEvent(input: CreateEventInput): Promise<ActionResult<EventView>> {
  if (!input.title.trim()) return { ok: false, reason: 'Titre obligatoire.' };
  const ev = await prisma.event.create({
    data: {
      guildConfigId: input.guildConfigId,
      title: input.title.trim(),
      startAt: input.startAt,
      location: input.location,
      ourRole: input.ourRole,
      description: input.description,
      createdByDiscordId: input.createdByDiscordId,
    },
  });
  return { ok: true, data: toView(ev, []) };
}

/** Evenements a venir (ACTIVE, depuis ~12h avant maintenant), tries par date. */
export async function listUpcomingEvents(guildConfigId: string): Promise<EventView[]> {
  const since = new Date(Date.now() - 12 * 3600 * 1000);
  const events = await prisma.event.findMany({
    where: { guildConfigId, status: EventStatus.ACTIVE, startAt: { gte: since } },
    orderBy: { startAt: 'asc' },
    include: { signups: { include: { employee: { select: { nomRP: true } } } } },
  });
  return events.map((e) => toView(e, e.signups.map((s) => s.employee.nomRP)));
}

/** Annule un evenement (le retire de l'agenda). */
export async function cancelEvent(
  guildConfigId: string,
  eventId: string,
): Promise<ActionResult<{ title: string }>> {
  const ev = await prisma.event.findFirst({ where: { id: eventId, guildConfigId } });
  if (!ev) return { ok: false, reason: 'Événement introuvable.' };
  await prisma.event.update({ where: { id: ev.id }, data: { status: EventStatus.CANCELLED } });
  return { ok: true, data: { title: ev.title } };
}

export type ToggleResult =
  | { ok: true; positioned: boolean; title: string }
  | { ok: false; reason: string };

/** Positionne / retire un employe d'un evenement (toggle). */
export async function toggleEventSignup(
  guildConfigId: string,
  eventId: string,
  employeeId: string,
): Promise<ToggleResult> {
  const ev = await prisma.event.findFirst({
    where: { id: eventId, guildConfigId, status: EventStatus.ACTIVE },
    select: { id: true, title: true },
  });
  if (!ev) return { ok: false, reason: 'Événement introuvable ou annulé.' };

  const existing = await prisma.eventSignup.findUnique({
    where: { eventId_employeeId: { eventId, employeeId } },
  });
  if (existing) {
    await prisma.eventSignup.delete({ where: { id: existing.id } });
    return { ok: true, positioned: false, title: ev.title };
  }
  await prisma.eventSignup.create({ data: { eventId, employeeId } });
  return { ok: true, positioned: true, title: ev.title };
}

function toView(
  ev: {
    id: string;
    title: string;
    startAt: Date;
    location: string | null;
    ourRole: string | null;
    description: string | null;
  },
  signups: string[],
): EventView {
  return {
    id: ev.id,
    title: ev.title,
    startAt: ev.startAt,
    location: ev.location,
    ourRole: ev.ourRole,
    description: ev.description,
    signups,
  };
}
