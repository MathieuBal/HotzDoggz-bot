import { prisma } from '../../infrastructure/database/client.js';
import { classifyRisk, FRAUD, type RiskVerdict } from './fraud.js';

/**
 * Cherche les references (ventes ET commandes) reutilisant l'un des hash fournis,
 * sur tout le serveur. Couvre les deux sens : une preuve PNJ recyclee sur une
 * commande, ou l'inverse.
 */
async function findDuplicateRefs(
  guildConfigId: string,
  hashes: readonly string[],
): Promise<string[]> {
  if (hashes.length === 0) return [];
  const list = [...hashes];
  const [inSales, inOrders] = await Promise.all([
    prisma.saleAttachment.findMany({
      where: { sha256: { in: list }, sale: { guildConfigId } },
      select: { sale: { select: { reference: true } } },
      distinct: ['sha256'],
    }),
    prisma.orderContributionAttachment.findMany({
      where: { sha256: { in: list }, contribution: { guildConfigId } },
      select: { contribution: { select: { order: { select: { reference: true } } } } },
      distinct: ['sha256'],
    }),
  ]);
  return [
    ...new Set([
      ...inSales.map((s) => s.sale.reference),
      ...inOrders.map((o) => o.contribution.order.reference),
    ]),
  ];
}

export interface EvaluateFraudParams {
  guildConfigId: string;
  employeeId: string;
  quantity: number;
  /** Hash SHA-256 des preuves de cette vente. */
  hashes: readonly string[];
}

/**
 * Evalue le risque d'une vente avant sa persistance : recherche de preuves
 * recyclees (meme hash, autre vente/commande du serveur) et rafale de declarations.
 * (Partie avec I/O : isolee de fraud.ts qui reste pur et testable.)
 */
export async function evaluateFraud(params: EvaluateFraudParams): Promise<RiskVerdict> {
  const { guildConfigId, employeeId, quantity, hashes } = params;
  const duplicateRefs = await findDuplicateRefs(guildConfigId, hashes);

  const since = new Date(Date.now() - FRAUD.BURST_WINDOW_MINUTES * 60_000);
  const recentCount = await prisma.sale.count({
    where: { guildConfigId, employeeId, createdAt: { gte: since } },
  });

  return classifyRisk({ duplicateRefs, recentCount, quantity });
}

/**
 * Evalue le risque d'une contribution a une commande. Memes preuves recyclees,
 * meme seuil de volume ; la rafale est sans objet (saisie par la direction).
 */
export async function evaluateOrderContributionFraud(params: {
  guildConfigId: string;
  quantity: number;
  hashes: readonly string[];
}): Promise<RiskVerdict> {
  const duplicateRefs = await findDuplicateRefs(params.guildConfigId, params.hashes);
  return classifyRisk({ duplicateRefs, recentCount: 0, quantity: params.quantity });
}
