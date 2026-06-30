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

export const VitrineModalId = {
  WELCOME: 'vitrine:welcome:modal',
  EVENT: 'vitrine:event:modal',
} as const;

export const VitrineFieldId = {
  TEXT: 'text',
} as const;

export const DirectSaleButtonId = {
  TAKE: 'direct:take',
  VALIDATE: 'direct:validate',
  REFUSE: 'direct:refuse',
  COMPLEMENT: 'direct:complement',
  CORRECT: 'direct:correct',
} as const;

export const DirectSaleModalId = {
  VALIDATE: 'direct:validate:modal',
  REFUSE: 'direct:refuse:modal',
  COMPLEMENT: 'direct:complement:modal',
  CORRECT: 'direct:correct:modal',
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

export const PlanningSelectId = {
  SIGNUP: 'planning:signup',
} as const;

export const GarageId = {
  PICK: 'garage:pick', // select d'un vehicule disponible a attribuer
  ASSIGN_TO: 'garage:assignto', // user-select, suffixe :<vehicleId>
  OPEN: 'garage:open', // select : ouvrir la carte d'un vehicule
  VEH_RAMASSER: 'garage:veh:ramasser', // bouton sur la carte, suffixe :<vehicleId>
  VEH_TRANSFORMER: 'garage:veh:transformer', // bouton sur la carte, suffixe :<vehicleId>
} as const;

/** Tableau de paie : menu « marquer une paie reglee en jeu » (valeur = employeeId). */
export const PayrollSelectId = {
  PAY: 'payroll:pay',
} as const;

/**
 * Salon "Gestion des employes" (direction). Menus et boutons portent l'employeeId
 * en suffixe (`:<employeeId>`) — un cuid sans `:`, donc parsable par split.
 */
export const StaffSelectId = {
  OPEN: 'staff:open', // trombinoscope -> ouvrir une carte (valeur = employeeId)
  GRADE_SET: 'staff:gradeset', // choix du grade a appliquer (suffixe :<employeeId>, valeur = roleId|none)
} as const;

export const StaffButtonId = {
  RENAME: 'staff:rename', // suffixe :<employeeId>
  GRADE: 'staff:grade', // suffixe :<employeeId>
  BRACELET: 'staff:bracelet', // suffixe :<employeeId>
  ARCHIVE: 'staff:archive', // suffixe :<employeeId>
  REACTIVATE: 'staff:reactivate', // suffixe :<employeeId>
  RESYNC: 'staff:resync', // suffixe :<employeeId>
  REFRESH: 'staff:refresh', // suffixe :<employeeId>
} as const;

export const StaffModalId = {
  RENAME: 'staff:rename:modal', // suffixe :<employeeId>
  BRACELET: 'staff:bracelet:modal', // suffixe :<employeeId>
} as const;

export const StaffFieldId = {
  NOM_RP: 'nom_rp',
  MULTIPLICATEUR: 'multiplicateur',
} as const;

/** Tableau stock : menus de selection de vehicule + modals de quantite. */
export const StockSelectId = {
  RAMASSER: 'stock:pick:ramasser',
  TRANSFORMER: 'stock:pick:transformer',
} as const;

export const StockModalId = {
  RAMASSER: 'stock:ramasser:modal', // suffixe :<vehicleId>
  TRANSFORMER: 'stock:transformer:modal', // suffixe :<vehicleId>
} as const;

export const StockFieldId = {
  QTE: 'qte',
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
  REPARTITION: 'repartition',
  PEREMPTION: 'peremption',
  FRAUDE: 'fraude',
  RAPPEL: 'rappel',
} as const;

export const PanelModalId = {
  SALAIRE: 'panel:salaire:modal',
  MENU: 'panel:menu:modal',
  MENU_REMOVE: 'panel:menuremove:modal',
  PARTNER_CREATE: 'panel:partnercreate:modal',
  PARTENAIRE: 'panel:partenaire:modal',
  ORDER_CREATE: 'panel:ordercreate:modal',
  PNJ_PRICE: 'panel:pnjprice:modal',
  REPARTITION: 'panel:repartition:modal',
  PEREMPTION: 'panel:peremption:modal',
  FRAUDE: 'panel:fraude:modal',
  RAPPEL: 'panel:rappel:modal',
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
  // Repartition des benefices
  RESERVE: 'reserve',
  PRIME: 'prime',
  DIRECTEUR: 'directeur',
  // Peremption
  JOURS: 'jours',
  HEURES: 'heures',
  // Anti-fraude
  SEUIL_VOLUME: 'seuil_volume',
  RAFALE_NB: 'rafale_nb',
  FENETRE_MIN: 'fenetre_min',
  // Rappel cloture + fuseau
  JOUR: 'jour',
  HEURE_DEBUT: 'heure_debut',
  HEURE_FIN: 'heure_fin',
  FUSEAU: 'fuseau',
} as const;
