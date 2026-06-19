import { SaleRisk } from '@prisma/client';

/**
 * Regles pures du controle d'integrite anti-fraude (CDC §10.3). Sans I/O, donc
 * testables et importables sans tirer la connexion base. Le bot ne bloque jamais
 * une vente sur ce seul motif : il la *signale* a la direction, qui tranche.
 * Trois signaux, du plus grave au plus benin :
 *   - preuve deja utilisee sur une autre vente  → 🔴 FLAGGED
 *   - volume declare anormalement eleve         → 🟠 SUSPECT
 *   - rafale de declarations rapprochees         → 🟠 SUSPECT
 *
 * Seuils volontairement prudents (peu de faux positifs). Ajustables ici.
 */
export const FRAUD = {
  /** Quantite declaree au-dela de laquelle une vente unique parait improbable. */
  QUANTITY_THRESHOLD: 1000,
  /** Nombre de ventes rapprochees considere comme une rafale suspecte. */
  BURST_COUNT: 3,
  /** Fenetre (minutes) d'observation de la rafale. */
  BURST_WINDOW_MINUTES: 10,
} as const;

export interface RiskInput {
  /** References des ventes existantes reutilisant une des preuves fournies. */
  duplicateRefs: readonly string[];
  /** Nombre de ventes recentes du meme employe dans la fenetre de rafale. */
  recentCount: number;
  /** Quantite declaree sur cette vente. */
  quantity: number;
}

export interface RiskVerdict {
  level: SaleRisk;
  reasons: string[];
}

/** Classement pur du risque (testable, sans I/O). */
export function classifyRisk(input: RiskInput): RiskVerdict {
  const reasons: string[] = [];
  let level: SaleRisk = SaleRisk.CLEAN;

  if (input.duplicateRefs.length > 0) {
    level = SaleRisk.FLAGGED;
    reasons.push(`Preuve deja utilisee sur ${input.duplicateRefs.join(', ')}.`);
  }
  if (input.quantity > FRAUD.QUANTITY_THRESHOLD) {
    if (level === SaleRisk.CLEAN) level = SaleRisk.SUSPECT;
    reasons.push(`Volume eleve (${input.quantity} u > ${FRAUD.QUANTITY_THRESHOLD}).`);
  }
  if (input.recentCount >= FRAUD.BURST_COUNT) {
    if (level === SaleRisk.CLEAN) level = SaleRisk.SUSPECT;
    reasons.push(
      `Cadence rapprochee (${input.recentCount} ventes en ${FRAUD.BURST_WINDOW_MINUTES} min).`,
    );
  }

  return { level, reasons };
}

/** Repere visuel du niveau de risque (fiche de controle / alertes). */
export function riskBadge(level: SaleRisk): string {
  return level === SaleRisk.FLAGGED ? '🔴' : level === SaleRisk.SUSPECT ? '🟠' : '🟢';
}
