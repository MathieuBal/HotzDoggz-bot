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

export const WeekButtonId = {
  CLOSE_CONFIRM: 'week:close:confirm',
  CLOSE_CANCEL: 'week:close:cancel',
  RESET_CONFIRM: 'week:reset:confirm',
  RESET_CANCEL: 'week:reset:cancel',
} as const;

export const WeekModalId = {
  FORCE_CLOSE: 'week:forceclose:modal',
} as const;

export const WeekFieldId = {
  REASON: 'reason',
  CONFIRM: 'confirm',
} as const;

/** Mot a saisir pour confirmer une cloture forcee (double confirmation). */
export const FORCE_CLOSE_WORD = 'CLOTURER';
