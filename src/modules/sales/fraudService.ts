import { prisma } from '../../infrastructure/database/client.js';
import { classifyRisk, FRAUD, type RiskVerdict } from './fraud.js';

export interface EvaluateFraudParams {
  guildConfigId: string;
  employeeId: string;
  quantity: number;
  /** Hash SHA-256 des preuves de cette vente. */
  hashes: readonly string[];
}

/**
 * Evalue le risque d'une vente avant sa persistance : recherche de preuves
 * recyclees (meme hash, autre vente du serveur) et de rafale de declarations.
 * (Partie avec I/O : isolee de fraud.ts qui reste pur et testable.)
 */
export async function evaluateFraud(params: EvaluateFraudParams): Promise<RiskVerdict> {
  const { guildConfigId, employeeId, quantity, hashes } = params;

  const duplicates =
    hashes.length === 0
      ? []
      : await prisma.saleAttachment.findMany({
          where: { sha256: { in: [...hashes] }, sale: { guildConfigId } },
          select: { sale: { select: { reference: true } } },
          distinct: ['sha256'],
        });
  const duplicateRefs = [...new Set(duplicates.map((d) => d.sale.reference))];

  const since = new Date(Date.now() - FRAUD.BURST_WINDOW_MINUTES * 60_000);
  const recentCount = await prisma.sale.count({
    where: { guildConfigId, employeeId, createdAt: { gte: since } },
  });

  return classifyRisk({ duplicateRefs, recentCount, quantity });
}
