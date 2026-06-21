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

export const ReviewButtonId = {
  OPEN: 'review:open',
} as const;

export const ReviewModalId = {
  SUBMIT: 'review:submit',
} as const;

export const ReviewFieldId = {
  RATING: 'rating',
  COMMENT: 'comment',
  EMPLOYEE: 'employee',
} as const;

export const VerificationButtonId = {
  ACCEPT: 'verify:accept',
} as const;

export const VerificationModalId = {
  SUBMIT: 'verify:submit',
} as const;

export const VerificationFieldId = {
  NOM_RP: 'nom_rp',
} as const;

export const DirectSaleButtonId = {
  TAKE: 'direct:take',
  VALIDATE: 'direct:validate',
  REFUSE: 'direct:refuse',
} as const;

export const DirectSaleModalId = {
  VALIDATE: 'direct:validate:modal',
  REFUSE: 'direct:refuse:modal',
} as const;

export const DirectSaleFieldId = {
  NOTE: 'note',
  REASON: 'reason',
} as const;

export const PanelButtonId = {
  OPEN_WEEK: 'panel:openweek',
  CLOSE_WEEK: 'panel:closeweek',
  REFRESH_BOARDS: 'panel:refreshboards',
  REFRESH: 'panel:refresh',
} as const;

export const PanelSelectId = {
  EDIT: 'panel:edit',
} as const;

/** Selecteurs de second niveau : choisir l'entite (grade/partenaire/produit). */
export const PanelPickId = {
  SALAIRE: 'panel:pick:salaire',
  PARTENAIRE: 'panel:pick:partenaire',
  MENU_RETIRER: 'panel:pick:menuretirer',
} as const;

/** Boutons de confirmation (jeton ephemere appose : `panel:confirm:<token>`). */
export const PanelConfirmId = {
  CONFIRM: 'panel:confirm',
  CANCEL: 'panel:cancel',
} as const;

export const PanelEditValue = {
  SALAIRE: 'salaire',
  MENU: 'menu',
  MENU_RETIRER: 'menu_retirer',
  PARTENAIRE: 'partenaire',
  PARTENAIRE_CREER: 'partenaire_creer',
  COMMANDE_CREER: 'commande_creer',
  PNJ_PRIX: 'pnj_prix',
} as const;

export const PanelModalId = {
  SALAIRE: 'panel:salaire:modal',
  MENU: 'panel:menu:modal',
  MENU_REMOVE: 'panel:menuremove:modal',
  PARTNER_CREATE: 'panel:partnercreate:modal',
  PARTENAIRE: 'panel:partenaire:modal',
  ORDER_CREATE: 'panel:ordercreate:modal',
  PNJ_PRICE: 'panel:pnjprice:modal',
} as const;

export const PanelFieldId = {
  GRADE: 'grade',
  MONTANT: 'montant',
  NOM: 'nom',
  PRIX: 'prix',
  OBJECTIF: 'objectif',
  CLIENT: 'client',
  VOLUME: 'volume',
  PARTENAIRE: 'partenaire',
  ECHEANCE: 'echeance',
} as const;
