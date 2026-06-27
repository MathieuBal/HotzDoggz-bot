import { getObjectStorage } from '../../infrastructure/object-storage/factory.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { writeAudit } from '../audit/auditService.js';
import { planPurge } from './purgePlan.js';

export interface PurgeResult {
  deleted: number;
  bytes: number;
  scanned: number;
  protectedCount: number;
}

/**
 * Rassemble les cles d'assets DURABLES qui ne doivent jamais etre purgees :
 * photos du menu (Product.imageKey) et photos de vehicules (Vehicle.photoKey).
 * Tout le reste (factures, preuves de coffre/paiement) est une copie d'audit
 * qui peut s'effacer une fois la retention depassee.
 */
async function collectProtectedKeys(): Promise<Set<string>> {
  const [products, vehicles] = await Promise.all([
    prisma.product.findMany({
      where: { imageKey: { not: null } },
      select: { imageKey: true },
    }),
    prisma.vehicle.findMany({
      where: { photoKey: { not: null } },
      select: { photoKey: true },
    }),
  ]);
  const keys = new Set<string>();
  for (const p of products) if (p.imageKey) keys.add(p.imageKey);
  for (const v of vehicles) if (v.photoKey) keys.add(v.photoKey);
  return keys;
}

/**
 * Purge les preuves images plus vieilles que `retentionDays`, en preservant les
 * assets durables references. Idempotent et sans danger pour la fenetre de
 * validation courante (la retention est tres superieure a un cycle de semaine).
 */
export async function purgeExpiredProofs(retentionDays: number): Promise<PurgeResult> {
  const storage = getObjectStorage();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60_000);

  const [objects, protectedKeys] = await Promise.all([storage.list(), collectProtectedKeys()]);
  const plan = planPurge(objects, cutoff, protectedKeys);

  let deleted = 0;
  for (const key of plan.keys) {
    try {
      await storage.delete(key);
      deleted++;
    } catch (err) {
      logger.warn({ err, key }, 'Purge : suppression d’un objet en echec');
    }
  }

  const result: PurgeResult = {
    deleted,
    // Octets planifies (les echecs de suppression sont rares et logues).
    bytes: plan.bytes,
    scanned: objects.length,
    protectedCount: protectedKeys.size,
  };
  if (deleted > 0) {
    logger.info(
      { ...result, retentionDays, mb: Math.round((plan.bytes / 1_048_576) * 10) / 10 },
      'Purge du stockage des preuves effectuee',
    );
    // Trace la suppression de preuves : action sensible pour la conformite, elle
    // ne doit pas etre silencieuse. Purge globale (multi-serveurs) => sans guild.
    await writeAudit(prisma, {
      action: 'STORAGE_PURGED',
      entityType: 'Storage',
      reason: `${deleted} preuve(s) supprimée(s) (rétention ${retentionDays} j)`,
      after: { deleted, bytes: plan.bytes, scanned: objects.length },
    }).catch((err) => logger.warn({ err }, 'Audit de purge en echec'));
  }
  return result;
}
