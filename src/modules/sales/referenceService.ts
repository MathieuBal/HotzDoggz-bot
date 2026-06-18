import type { Prisma } from '@prisma/client';
import { formatSaleReference, parseSaleReference } from './reference.js';

/**
 * Alloue la prochaine reference de vente HD-AAAA-NNNN pour l'annee donnee
 * (CDC §4.5). Sequence par serveur et par annee.
 *
 * En cas de collision (creation concurrente), la contrainte UNIQUE sur
 * `Sale.reference` protege : l'appelant reessaie l'allocation.
 */
export async function allocateReference(
  tx: Prisma.TransactionClient,
  guildConfigId: string,
  year: number,
): Promise<string> {
  const last = await tx.sale.findFirst({
    where: { guildConfigId, reference: { startsWith: `HD-${year}-` } },
    orderBy: { createdAt: 'desc' },
    select: { reference: true },
  });
  const lastSeq = last ? (parseSaleReference(last.reference)?.sequence ?? 0) : 0;
  return formatSaleReference(year, lastSeq + 1);
}
