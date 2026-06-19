import type { Prisma } from '@prisma/client';
import { formatOrderReference, parseOrderReference } from './orderReference.js';

/**
 * Alloue la prochaine reference CMD-AAAA-NNNN pour l'annee donnee. Sequence par
 * serveur et par annee. La contrainte UNIQUE sur ClientOrder.reference protege
 * des collisions concurrentes : l'appelant reessaie.
 */
export async function allocateOrderReference(
  tx: Prisma.TransactionClient,
  guildConfigId: string,
  year: number,
): Promise<string> {
  const last = await tx.clientOrder.findFirst({
    where: { guildConfigId, reference: { startsWith: `CMD-${year}-` } },
    orderBy: { createdAt: 'desc' },
    select: { reference: true },
  });
  const lastSeq = last ? (parseOrderReference(last.reference)?.sequence ?? 0) : 0;
  return formatOrderReference(year, lastSeq + 1);
}
