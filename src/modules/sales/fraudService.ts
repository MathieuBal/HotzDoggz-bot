import { prisma } from '../../infrastructure/database/client.js';
import {
  classifyRisk,
  DEFAULT_FRAUD_THRESHOLDS,
  fraudThresholdsFromConfig,
  type FraudThresholds,
  type RiskVerdict,
} from './fraud.js';

/** Charge les seuils anti-fraude du serveur (defauts si config absente). */
async function loadFraudThresholds(guildConfigId: string): Promise<FraudThresholds> {
  const cfg = await prisma.guildConfig.findUnique({
    where: { id: guildConfigId },
    select: {
      fraudQuantityThreshold: true,
      fraudBurstCount: true,
      fraudBurstWindowMinutes: true,
    },
  });
  return cfg ? fraudThresholdsFromConfig(cfg) : DEFAULT_FRAUD_THRESHOLDS;
}

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
  const [inSales, inOrders, inDirect] = await Promise.all([
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
    prisma.directSaleAttachment.findMany({
      where: { sha256: { in: list }, directSale: { guildConfigId } },
      select: { directSale: { select: { reference: true } } },
      distinct: ['sha256'],
    }),
  ]);
  return [
    ...new Set([
      ...inSales.map((s) => s.sale.reference),
      ...inOrders.map((o) => o.contribution.order.reference),
      ...inDirect.map((d) => d.directSale.reference),
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
  const [duplicateRefs, thresholds] = await Promise.all([
    findDuplicateRefs(guildConfigId, hashes),
    loadFraudThresholds(guildConfigId),
  ]);

  const since = new Date(Date.now() - thresholds.burstWindowMinutes * 60_000);
  const recentCount = await prisma.sale.count({
    where: { guildConfigId, employeeId, createdAt: { gte: since } },
  });

  return classifyRisk({ duplicateRefs, recentCount, quantity }, thresholds);
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
  const [duplicateRefs, thresholds] = await Promise.all([
    findDuplicateRefs(params.guildConfigId, params.hashes),
    loadFraudThresholds(params.guildConfigId),
  ]);
  return classifyRisk({ duplicateRefs, recentCount: 0, quantity: params.quantity }, thresholds);
}

/** Evalue le risque d'une vente main en main (facture recyclee, volume). */
export async function evaluateDirectSaleFraud(params: {
  guildConfigId: string;
  quantity: number;
  hashes: readonly string[];
}): Promise<RiskVerdict> {
  const [duplicateRefs, thresholds] = await Promise.all([
    findDuplicateRefs(params.guildConfigId, params.hashes),
    loadFraudThresholds(params.guildConfigId),
  ]);
  return classifyRisk({ duplicateRefs, recentCount: 0, quantity: params.quantity }, thresholds);
}
