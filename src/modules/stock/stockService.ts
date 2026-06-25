import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../audit/auditService.js';
import { expiryOf } from './perishable.js';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface VehicleView {
  id: string;
  name: string | null;
  make: string;
  plate: string;
  saucisses: number;
}

export interface BatchView {
  id: string;
  remaining: number;
  quantity: number;
  producedAt: Date;
  expiresAt: Date;
  vehiclePlate: string | null;
}

export interface StockState {
  vehicles: VehicleView[];
  totalSaucisses: number;
  batches: BatchView[]; // lots de hot dogs avec du reste, tries par peremption
  totalHotdogs: number;
}

function label(v: { name: string | null; make: string; plate: string }): string {
  return v.name ? `${v.name} (${v.plate})` : `${v.make} ${v.plate}`;
}

/** Enregistre un vehicule (marque + plaque uniques par serveur). */
export async function addVehicle(
  guildConfigId: string,
  make: string,
  plate: string,
  name: string | null,
  byDiscordId: string,
): Promise<ActionResult<VehicleView>> {
  const cleanPlate = plate.trim().toUpperCase();
  if (!make.trim() || !cleanPlate) return { ok: false, reason: 'Marque et plaque obligatoires.' };
  const existing = await prisma.vehicle.findUnique({
    where: { guildConfigId_plate: { guildConfigId, plate: cleanPlate } },
  });
  if (existing) {
    if (existing.active) return { ok: false, reason: `Un véhicule a déjà la plaque ${cleanPlate}.` };
    const reactivated = await prisma.vehicle.update({
      where: { id: existing.id },
      data: { active: true, make: make.trim(), name: name?.trim() || null },
    });
    return { ok: true, data: toVehicle(reactivated) };
  }
  const v = await prisma.vehicle.create({
    data: { guildConfigId, make: make.trim(), plate: cleanPlate, name: name?.trim() || null },
  });
  await writeAudit(prisma, {
    guildConfigId,
    action: 'VEHICLE_ADDED',
    authorDiscordId: byDiscordId,
    entityType: 'Vehicle',
    entityId: v.id,
    after: { make: v.make, plate: v.plate },
  });
  return { ok: true, data: toVehicle(v) };
}

/** Retire (desactive) un vehicule. */
export async function removeVehicle(
  guildConfigId: string,
  vehicleId: string,
): Promise<ActionResult<{ plate: string }>> {
  const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, guildConfigId, active: true } });
  if (!v) return { ok: false, reason: 'Véhicule introuvable.' };
  await prisma.vehicle.update({ where: { id: v.id }, data: { active: false } });
  return { ok: true, data: { plate: v.plate } };
}

export async function listVehicles(guildConfigId: string): Promise<VehicleView[]> {
  const vs = await prisma.vehicle.findMany({
    where: { guildConfigId, active: true },
    orderBy: [{ saucisses: 'desc' }, { plate: 'asc' }],
  });
  return vs.map(toVehicle);
}

/** Definit le stock de saucisses d'un vehicule (valeur ABSOLUE = ce que montre le coffre). */
export async function setSaucisses(
  guildConfigId: string,
  vehicleId: string,
  quantity: number,
  byDiscordId: string,
): Promise<ActionResult<{ vehicle: VehicleView; previous: number }>> {
  if (!Number.isInteger(quantity) || quantity < 0) {
    return { ok: false, reason: 'Quantité invalide (0 ou plus).' };
  }
  const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, guildConfigId, active: true } });
  if (!v) return { ok: false, reason: 'Véhicule introuvable.' };
  const updated = await prisma.vehicle.update({
    where: { id: v.id },
    data: { saucisses: quantity },
  });
  await writeAudit(prisma, {
    guildConfigId,
    action: 'SAUCISSES_SET',
    authorDiscordId: byDiscordId,
    entityType: 'Vehicle',
    entityId: v.id,
    before: { saucisses: v.saucisses },
    after: { saucisses: quantity },
  });
  return { ok: true, data: { vehicle: toVehicle(updated), previous: v.saucisses } };
}

/** Transformation saucisses -> hot dogs (1:1). Cree un lot perissable. */
export async function transformToHotdogs(
  guildConfigId: string,
  vehicleId: string,
  quantity: number,
  byDiscordId: string,
): Promise<ActionResult<{ vehicle: VehicleView; expiresAt: Date }>> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, reason: 'Quantité invalide (entier positif).' };
  }
  return prisma.$transaction(async (tx) => {
    const v = await tx.vehicle.findFirst({ where: { id: vehicleId, guildConfigId, active: true } });
    if (!v) return { ok: false as const, reason: 'Véhicule introuvable.' };
    if (v.saucisses < quantity) {
      return { ok: false as const, reason: `Pas assez de saucisses (${v.saucisses} en stock).` };
    }
    const updated = await tx.vehicle.update({
      where: { id: v.id },
      data: { saucisses: { decrement: quantity } },
    });
    const cfg = await tx.guildConfig.findUnique({
      where: { id: guildConfigId },
      select: { hotdogLifetimeMinutes: true },
    });
    const producedAt = new Date();
    const expiresAt = expiryOf(producedAt, (cfg?.hotdogLifetimeMinutes ?? 9660) * 60_000);
    await tx.hotdogBatch.create({
      data: {
        guildConfigId,
        vehicleId: v.id,
        quantity,
        remaining: quantity,
        producedAt,
        expiresAt,
        createdByDiscordId: byDiscordId,
      },
    });
    await writeAudit(tx, {
      guildConfigId,
      action: 'HOTDOGS_PRODUCED',
      authorDiscordId: byDiscordId,
      entityType: 'Vehicle',
      entityId: v.id,
      after: { quantity, expiresAt: expiresAt.toISOString() },
    });
    return { ok: true as const, data: { vehicle: toVehicle(updated), expiresAt } };
  });
}

/** Sortie de hot dogs (vendus / utilises / jetes) : consomme FIFO (plus vieux d'abord). */
export async function consumeHotdogs(
  guildConfigId: string,
  quantity: number,
  byDiscordId: string,
): Promise<ActionResult<{ consumed: number }>> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, reason: 'Quantité invalide (entier positif).' };
  }
  return prisma.$transaction(async (tx) => {
    const batches = await tx.hotdogBatch.findMany({
      where: { guildConfigId, remaining: { gt: 0 } },
      orderBy: { producedAt: 'asc' },
    });
    const available = batches.reduce((s, b) => s + b.remaining, 0);
    if (available < quantity) {
      return { ok: false as const, reason: `Seulement ${available} hot dog(s) en stock.` };
    }
    let left = quantity;
    for (const b of batches) {
      if (left <= 0) break;
      const take = Math.min(b.remaining, left);
      await tx.hotdogBatch.update({ where: { id: b.id }, data: { remaining: b.remaining - take } });
      left -= take;
    }
    await writeAudit(tx, {
      guildConfigId,
      action: 'HOTDOGS_CONSUMED',
      authorDiscordId: byDiscordId,
      after: { quantity },
    });
    return { ok: true as const, data: { consumed: quantity } };
  });
}

/** Etat du stock (vehicules + lots de hot dogs non ecoules, non expires). */
export async function getStockState(guildConfigId: string): Promise<StockState> {
  const now = new Date();
  const [vehicles, batches] = await Promise.all([
    prisma.vehicle.findMany({
      where: { guildConfigId, active: true },
      orderBy: [{ saucisses: 'desc' }, { plate: 'asc' }],
    }),
    prisma.hotdogBatch.findMany({
      where: { guildConfigId, remaining: { gt: 0 }, expiresAt: { gt: now } },
      orderBy: { expiresAt: 'asc' },
      include: { vehicle: { select: { plate: true } } },
    }),
  ]);
  return {
    vehicles: vehicles.map(toVehicle),
    totalSaucisses: vehicles.reduce((s, v) => s + v.saucisses, 0),
    batches: batches.map((b) => ({
      id: b.id,
      remaining: b.remaining,
      quantity: b.quantity,
      producedAt: b.producedAt,
      expiresAt: b.expiresAt,
      vehiclePlate: b.vehicle?.plate ?? null,
    })),
    totalHotdogs: batches.reduce((s, b) => s + b.remaining, 0),
  };
}

export { label as vehicleLabel };

function toVehicle(v: {
  id: string;
  name: string | null;
  make: string;
  plate: string;
  saucisses: number;
}): VehicleView {
  return { id: v.id, name: v.name, make: v.make, plate: v.plate, saucisses: v.saucisses };
}
