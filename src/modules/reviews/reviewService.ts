import type { Review } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

// Anti-spam : un avis par personne toutes les 24 h.
const COOLDOWN_MS = 24 * 3_600_000;

export interface ReviewStats {
  count: number;
  average: number; // 0 si aucun avis
}

/** Note moyenne et nombre d'avis visibles. */
export async function getReviewStats(guildConfigId: string): Promise<ReviewStats> {
  const agg = await prisma.review.aggregate({
    where: { guildConfigId, status: 'VISIBLE' },
    _avg: { rating: true },
    _count: true,
  });
  return { count: agg._count, average: agg._avg.rating ?? 0 };
}

/** Cherche un employe actif par nom RP (insensible a la casse). */
export async function matchEmployeeByName(
  guildConfigId: string,
  name: string,
): Promise<{ id: string; nomRP: string } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const emp = await prisma.employee.findFirst({
    where: { guildConfigId, status: 'ACTIVE', nomRP: { equals: trimmed, mode: 'insensitive' } },
    select: { id: true, nomRP: true },
  });
  return emp;
}

export interface CreateReviewInput {
  guildConfigId: string;
  authorDiscordId: string;
  authorName: string;
  rating: number;
  comment: string;
  employeeName: string | null;
  employeeId: string | null;
}

/** Enregistre un avis (anti-spam 24 h). */
export async function createReview(input: CreateReviewInput): Promise<ActionResult<Review>> {
  const since = new Date(Date.now() - COOLDOWN_MS);
  const recent = await prisma.review.count({
    where: { authorDiscordId: input.authorDiscordId, createdAt: { gte: since } },
  });
  if (recent > 0) {
    return { ok: false, reason: 'Tu as déjà laissé un avis récemment. Reviens dans 24 h !' };
  }
  const review = await prisma.review.create({
    data: {
      guildConfigId: input.guildConfigId,
      authorDiscordId: input.authorDiscordId,
      authorName: input.authorName,
      rating: input.rating,
      comment: input.comment,
      employeeName: input.employeeName,
      employeeId: input.employeeId,
    },
  });
  return { ok: true, data: review };
}

/** Mémorise l'id du message de la carte (pour la synchro suppression). */
export async function attachReviewMessage(reviewId: string, messageId: string): Promise<void> {
  await prisma.review.update({ where: { id: reviewId }, data: { messageId } });
}

/**
 * Masque un avis dont la carte a ete supprimee (moderation par la direction).
 * @returns guildConfigId si un avis visible a bien ete masque, sinon null.
 */
export async function removeReviewByMessageId(messageId: string): Promise<string | null> {
  const review = await prisma.review.findUnique({ where: { messageId } });
  if (!review || review.status !== 'VISIBLE') return null;
  await prisma.review.update({ where: { id: review.id }, data: { status: 'REMOVED' } });
  return review.guildConfigId;
}
