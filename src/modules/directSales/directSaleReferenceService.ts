import type { Prisma } from '@prisma/client';
import { formatDirectSaleReference, parseDirectSaleReference } from './directSaleReference.js';

/** Alloue la prochaine reference VD-AAAA-NNNN (sequence par serveur et annee). */
export async function allocateDirectSaleReference(
  tx: Prisma.TransactionClient,
  guildConfigId: string,
  year: number,
): Promise<string> {
  const last = await tx.directSale.findFirst({
    where: { guildConfigId, reference: { startsWith: `VD-${year}-` } },
    orderBy: { createdAt: 'desc' },
    select: { reference: true },
  });
  const lastSeq = last ? (parseDirectSaleReference(last.reference)?.sequence ?? 0) : 0;
  return formatDirectSaleReference(year, lastSeq + 1);
}
