import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../audit/auditService.js';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export const MAX_VEHICLES_PER_EMPLOYEE = 3;

export interface GarageVehicle {
  id: string;
  name: string | null;
  make: string;
  plate: string;
  capacity: number;
  saucisses: number;
  photoKey: string | null;
  photoName: string | null;
  ownerId: string | null;
  ownerNomRP: string | null;
  ownerDiscordId: string | null;
}

/** Nombre de vehicules actifs attribues a un employe. */
export async function countOwned(guildConfigId: string, employeeId: string): Promise<number> {
  return prisma.vehicle.count({ where: { guildConfigId, ownerId: employeeId, active: true } });
}

export interface CreateVehicleInput {
  guildConfigId: string;
  make: string;
  plate: string;
  name: string | null;
  capacity: number;
  photoKey: string | null;
  photoName: string | null;
  ownerId: string | null; // null = disponible a donner
  ownerIsDirection: boolean; // exempt de la limite de 3
  byDiscordId: string;
}

export async function createVehicle(input: CreateVehicleInput): Promise<ActionResult<GarageVehicle>> {
  const plate = input.plate.trim().toUpperCase();
  if (!input.make.trim() || !plate) return { ok: false, reason: 'Marque et plaque obligatoires.' };
  if (!Number.isInteger(input.capacity) || input.capacity < 0) {
    return { ok: false, reason: 'Poids transportable invalide.' };
  }
  const dup = await prisma.vehicle.findUnique({
    where: { guildConfigId_plate: { guildConfigId: input.guildConfigId, plate } },
  });
  if (dup?.active) return { ok: false, reason: `Un véhicule a déjà la plaque ${plate}.` };

  if (input.ownerId && !input.ownerIsDirection) {
    const n = await countOwned(input.guildConfigId, input.ownerId);
    if (n >= MAX_VEHICLES_PER_EMPLOYEE) {
      return { ok: false, reason: `Limite atteinte : ${MAX_VEHICLES_PER_EMPLOYEE} véhicules max par employé.` };
    }
  }

  const data = {
    guildConfigId: input.guildConfigId,
    make: input.make.trim(),
    plate,
    name: input.name?.trim() || null,
    capacity: input.capacity,
    photoKey: input.photoKey,
    photoName: input.photoName,
    ownerId: input.ownerId,
    active: true,
  };
  const v = dup
    ? await prisma.vehicle.update({ where: { id: dup.id }, data })
    : await prisma.vehicle.create({ data });

  await writeAudit(prisma, {
    guildConfigId: input.guildConfigId,
    action: 'VEHICLE_REGISTERED',
    authorDiscordId: input.byDiscordId,
    entityType: 'Vehicle',
    entityId: v.id,
    after: { make: v.make, plate: v.plate, ownerId: v.ownerId, capacity: v.capacity },
  });
  return { ok: true, data: await toGarage(v.id) };
}

/** Attribue (ou reattribue) un vehicule a un employe. ownerId null = remise au pool. */
export async function assignVehicle(
  guildConfigId: string,
  vehicleId: string,
  ownerId: string | null,
  ownerIsDirection: boolean,
  byDiscordId: string,
): Promise<ActionResult<GarageVehicle>> {
  const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, guildConfigId, active: true } });
  if (!v) return { ok: false, reason: 'Véhicule introuvable.' };

  if (ownerId && !ownerIsDirection) {
    const n = await countOwned(guildConfigId, ownerId);
    // Si le vehicule appartient deja a cet employe, pas de double comptage.
    if (v.ownerId !== ownerId && n >= MAX_VEHICLES_PER_EMPLOYEE) {
      return { ok: false, reason: `Cet employé a déjà ${MAX_VEHICLES_PER_EMPLOYEE} véhicules (max).` };
    }
  }
  await prisma.vehicle.update({ where: { id: v.id }, data: { ownerId } });
  await writeAudit(prisma, {
    guildConfigId,
    action: 'VEHICLE_ASSIGNED',
    authorDiscordId: byDiscordId,
    entityType: 'Vehicle',
    entityId: v.id,
    before: { ownerId: v.ownerId },
    after: { ownerId },
  });
  return { ok: true, data: await toGarage(v.id) };
}

export interface GarageData {
  available: GarageVehicle[]; // sans proprietaire (a donner)
  byOwner: { ownerNomRP: string; ownerDiscordId: string | null; vehicles: GarageVehicle[] }[];
  total: number;
}

export async function getGarage(guildConfigId: string): Promise<GarageData> {
  const vehicles = await prisma.vehicle.findMany({
    where: { guildConfigId, active: true },
    orderBy: [{ plate: 'asc' }],
    include: { owner: { select: { nomRP: true, discordUserId: true } } },
  });
  const all = vehicles.map(mapVehicle);
  const available = all.filter((v) => v.ownerId === null);

  const groups = new Map<string, { ownerNomRP: string; ownerDiscordId: string | null; vehicles: GarageVehicle[] }>();
  for (const v of all) {
    if (!v.ownerId) continue;
    const g = groups.get(v.ownerId) ?? {
      ownerNomRP: v.ownerNomRP ?? '—',
      ownerDiscordId: v.ownerDiscordId,
      vehicles: [],
    };
    g.vehicles.push(v);
    groups.set(v.ownerId, g);
  }
  return {
    available,
    byOwner: [...groups.values()].sort((a, b) => a.ownerNomRP.localeCompare(b.ownerNomRP)),
    total: all.length,
  };
}

export async function listAvailable(guildConfigId: string): Promise<GarageVehicle[]> {
  const vs = await prisma.vehicle.findMany({
    where: { guildConfigId, active: true, ownerId: null },
    orderBy: { plate: 'asc' },
  });
  return vs.map((v) => mapVehicle({ ...v, owner: null }));
}

async function toGarage(id: string): Promise<GarageVehicle> {
  const v = await prisma.vehicle.findUniqueOrThrow({
    where: { id },
    include: { owner: { select: { nomRP: true, discordUserId: true } } },
  });
  return mapVehicle(v);
}

function mapVehicle(v: {
  id: string;
  name: string | null;
  make: string;
  plate: string;
  capacity: number;
  saucisses: number;
  photoKey: string | null;
  photoName: string | null;
  ownerId: string | null;
  owner: { nomRP: string; discordUserId: string } | null;
}): GarageVehicle {
  return {
    id: v.id,
    name: v.name,
    make: v.make,
    plate: v.plate,
    capacity: v.capacity,
    saucisses: v.saucisses,
    photoKey: v.photoKey,
    photoName: v.photoName,
    ownerId: v.ownerId,
    ownerNomRP: v.owner?.nomRP ?? null,
    ownerDiscordId: v.owner?.discordUserId ?? null,
  };
}
