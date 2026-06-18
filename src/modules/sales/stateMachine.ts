import { SaleStatus } from '@prisma/client';

/**
 * Machine a etats d'une vente (CDC §4.8 / Annexe B).
 * La base conserve des statuts internes precis et refuse les transitions
 * incoherentes ; les tags Discord ne sont qu'une vue.
 *
 * Fonction PURE => testable.
 */
export const ALLOWED_TRANSITIONS: Record<SaleStatus, SaleStatus[]> = {
  [SaleStatus.SOUMISE]: [
    SaleStatus.EN_VERIFICATION,
    SaleStatus.INCOMPLETE,
    SaleStatus.VALIDEE,
    SaleStatus.REFUSEE,
    SaleStatus.ANNULEE,
  ],
  [SaleStatus.EN_VERIFICATION]: [
    SaleStatus.INCOMPLETE,
    SaleStatus.VALIDEE,
    SaleStatus.REFUSEE,
    SaleStatus.ANNULEE,
  ],
  [SaleStatus.INCOMPLETE]: [
    SaleStatus.EN_VERIFICATION,
    SaleStatus.VALIDEE,
    SaleStatus.REFUSEE,
    SaleStatus.ANNULEE,
  ],
  [SaleStatus.VALIDEE]: [SaleStatus.INTEGREE_A_LA_PAIE, SaleStatus.ANNULEE],
  [SaleStatus.INTEGREE_A_LA_PAIE]: [SaleStatus.PAYEE, SaleStatus.ANNULEE],
  [SaleStatus.PAYEE]: [],
  [SaleStatus.REFUSEE]: [SaleStatus.SOUMISE], // reouverture possible
  [SaleStatus.ANNULEE]: [],
};

export function canTransition(from: SaleStatus, to: SaleStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: SaleStatus, to: SaleStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transition de statut interdite : ${from} -> ${to}`);
  }
}
