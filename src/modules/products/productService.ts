import type { Product } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** Produits actifs du menu, tries par prix croissant. */
export function listActiveProducts(guildConfigId: string): Promise<Product[]> {
  return prisma.product.findMany({
    where: { guildConfigId, active: true },
    orderBy: [{ retailPrice: 'asc' }, { name: 'asc' }],
  });
}

/** Produit actif par nom (insensible a la casse). */
export function findActiveProductByName(
  guildConfigId: string,
  name: string,
): Promise<Product | null> {
  return prisma.product.findFirst({
    where: { guildConfigId, active: true, name: { equals: name.trim(), mode: 'insensitive' } },
  });
}

/** Cree un produit ou reactive/maj un produit du meme nom. */
export async function upsertProduct(
  guildConfigId: string,
  name: string,
  retailPrice: number,
): Promise<ActionResult<Product>> {
  const cleaned = name.trim();
  if (!cleaned) return { ok: false, reason: 'Nom de produit vide.' };
  if (!Number.isInteger(retailPrice) || retailPrice < 1) {
    return { ok: false, reason: 'Le prix doit être un entier positif.' };
  }
  const product = await prisma.product.upsert({
    where: { guildConfigId_name: { guildConfigId, name: cleaned } },
    create: { guildConfigId, name: cleaned, retailPrice },
    update: { retailPrice, active: true },
  });
  return { ok: true, data: product };
}

/** Associe une image (deja stockee) + accroche optionnelle a un produit actif. */
export async function setProductImage(
  guildConfigId: string,
  name: string,
  imageKey: string,
  imageName: string,
  description?: string | null,
): Promise<ActionResult<Product>> {
  const product = await findActiveProductByName(guildConfigId, name);
  if (!product) return { ok: false, reason: 'Produit introuvable.' };
  const updated = await prisma.product.update({
    where: { id: product.id },
    data: {
      imageKey,
      imageName,
      ...(description !== undefined ? { description: description || null } : {}),
    },
  });
  return { ok: true, data: updated };
}

/** Desactive un produit (conserve l'historique des ventes). */
export async function deactivateProduct(
  guildConfigId: string,
  name: string,
): Promise<ActionResult<Product>> {
  const product = await findActiveProductByName(guildConfigId, name);
  if (!product) return { ok: false, reason: 'Produit introuvable.' };
  const updated = await prisma.product.update({
    where: { id: product.id },
    data: { active: false },
  });
  return { ok: true, data: updated };
}
