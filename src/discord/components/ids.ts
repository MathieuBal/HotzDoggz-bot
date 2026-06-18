/** Identifiants des composants de la fiche de controle (boutons & modals). */

export const SaleButtonId = {
  TAKE: 'sale:take',
  COMPLEMENT: 'sale:complement',
  VALIDATE: 'sale:validate',
  REFUSE: 'sale:refuse',
  CORRECT: 'sale:correct',
} as const;

export const SaleModalId = {
  COMPLEMENT: 'sale:complement:modal',
  VALIDATE: 'sale:validate:modal',
  REFUSE: 'sale:refuse:modal',
  CORRECT: 'sale:correct:modal',
} as const;

export const SaleFieldId = {
  QUANTITY: 'quantity',
  NOTE: 'note',
  COMMENT: 'comment',
  REASON: 'reason',
} as const;
