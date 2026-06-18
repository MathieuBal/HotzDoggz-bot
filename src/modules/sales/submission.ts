/**
 * Evaluation de conformite d'une declaration (CDC §4.3 / §4.4 / §11).
 *
 * Fonction PURE : a partir de faits deja resolus par le service d'ingestion,
 * elle decide du sort du post. Les controles d'appartenance au casier et
 * d'existence en base sont faits en amont (idempotence).
 *
 * Precedence des verdicts (du plus bloquant au plus favorable) :
 *  1. technical_refusal : auteur != proprietaire du casier (§11).
 *  2. incomplete        : elements corrigeables par l'employe (§4.4).
 *  3. blocked           : etat systeme (aucune semaine ouverte) — sans penaliser.
 *  4. accepted          : recevable, integrable au workflow.
 */

export interface SubmissionFacts {
  /** L'auteur du post est-il le proprietaire du casier ? */
  authorIsOwner: boolean;
  /** Le tag initial "Nouvelle vente" est-il present ? */
  hasNewSaleTag: boolean;
  /** Nombre de pieces jointes image du message initial. */
  imageCount: number;
  /** Quantite exploitable extraite du titre/contenu, ou null. */
  quantity: number | null;
  /** Une semaine comptable est-elle ouverte ? */
  weekOpen: boolean;
}

export type SubmissionVerdict =
  | { status: 'technical_refusal'; reasons: string[] }
  | { status: 'incomplete'; reasons: string[] }
  | { status: 'blocked'; reasons: string[] }
  | { status: 'accepted'; reasons: [] };

export const MIN_IMAGE_ATTACHMENTS = 2;

export function evaluateSubmission(facts: SubmissionFacts): SubmissionVerdict {
  if (!facts.authorIsOwner) {
    return {
      status: 'technical_refusal',
      reasons: ["L'auteur du post n'est pas le proprietaire du casier."],
    };
  }

  const incomplete: string[] = [];
  if (!facts.hasNewSaleTag) {
    incomplete.push('Le tag « Nouvelle vente » est manquant.');
  }
  if (facts.imageCount < MIN_IMAGE_ATTACHMENTS) {
    incomplete.push(
      `Deux captures sont requises (coffre plein avant et coffre vide apres) — recu : ${facts.imageCount}.`,
    );
  }
  if (facts.quantity === null) {
    incomplete.push('La quantite vendue est introuvable dans le titre ou le contenu.');
  }
  if (incomplete.length > 0) {
    return { status: 'incomplete', reasons: incomplete };
  }

  if (!facts.weekOpen) {
    return {
      status: 'blocked',
      reasons: [
        'Aucune semaine comptable ouverte : la vente sera prise en compte a son ouverture.',
      ],
    };
  }

  return { status: 'accepted', reasons: [] };
}
