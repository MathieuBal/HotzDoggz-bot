import { ForumTagKey, SaleStatus } from '@prisma/client';

/** Libelle affiche sur la fiche de controle (Annexe B, colonne "Tag controle"). */
const CONTROL_LABELS: Record<SaleStatus, string> = {
  [SaleStatus.SOUMISE]: 'Nouvelle',
  [SaleStatus.EN_VERIFICATION]: 'En verification',
  [SaleStatus.INCOMPLETE]: 'A completer',
  [SaleStatus.VALIDEE]: 'Validee',
  [SaleStatus.INTEGREE_A_LA_PAIE]: 'A payer',
  [SaleStatus.PAYEE]: 'Payee',
  [SaleStatus.REFUSEE]: 'Refusee',
  [SaleStatus.ANNULEE]: 'Annulee',
};

export function controlLabel(status: SaleStatus): string {
  return CONTROL_LABELS[status];
}

/** Tag de casier correspondant a un statut interne (Annexe B), ou null. */
const CASIER_TAG: Record<SaleStatus, ForumTagKey | null> = {
  [SaleStatus.SOUMISE]: ForumTagKey.A_VERIFIER,
  [SaleStatus.EN_VERIFICATION]: ForumTagKey.A_VERIFIER,
  [SaleStatus.INCOMPLETE]: ForumTagKey.A_COMPLETER,
  [SaleStatus.VALIDEE]: ForumTagKey.VALIDEE,
  [SaleStatus.INTEGREE_A_LA_PAIE]: ForumTagKey.VALIDEE,
  [SaleStatus.PAYEE]: ForumTagKey.PAYEE,
  [SaleStatus.REFUSEE]: ForumTagKey.REFUSEE,
  [SaleStatus.ANNULEE]: null,
};

export function casierTagFor(status: SaleStatus): ForumTagKey | null {
  return CASIER_TAG[status];
}
