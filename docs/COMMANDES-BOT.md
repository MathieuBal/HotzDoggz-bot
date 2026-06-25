# HotzDoggz — Les commandes du bot (guide directeur)

Petit mémo de **toutes les commandes** du bot, expliquées simplement.
Sur Discord, tape `/` puis le nom : Discord propose les options automatiquement.
Les réponses du bot ne sont visibles **que par toi** (sauf les tableaux publics).

---

## 👥 Pour tous les employés

| Commande    | À quoi ça sert                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/vendre`   | Déclarer une vente PNJ. L'employé donne la quantité + 2 captures (coffre plein, coffre vide) ; le bot crée le post au bon format et l'envoie en vérification. |
| `/facture`  | Déclarer une vente **main en main** : produits du menu (autocomplétion) + quantités + **photo de la facture**. Le bot crée une fiche que la direction valide. |
| `/macompta` | Voir sa propre production de la semaine, son salaire provisoire et son écart au meilleur employé (motivation).                                                |

---

## 🛠️ Réservé à la direction

### Commandes client (les vraies commandes de joueurs)

| Commande               | À quoi ça sert                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/commande creer`      | Enregistrer une commande négociée : client, volume, prix, échéance.                                                     |
| `/commande contribuer` | Noter la production d'un employé sur la commande (+ 2 preuves). Ses unités comptent dans son salaire et son classement. |
| `/commande livrer`     | Marquer la commande comme livrée au client (en attente de paiement).                                                    |
| `/commande payer`      | Encaisser (+ preuve de paiement) → le prix rejoint le chiffre d'affaires de la semaine.                                 |
| `/commande voir`       | Afficher l'état d'une commande (progression, contributeurs).                                                            |
| `/commande annuler`    | Annuler une commande (tant qu'elle n'est pas payée).                                                                    |

### Menu des produits (ventes main en main)

| Commande        | À quoi ça sert                                           |
| --------------- | -------------------------------------------------------- |
| `/menu ajouter` | Ajouter un produit ou changer son prix (ex. Simple 350). |
| `/menu retirer` | Retirer un produit du menu.                              |
| `/menu voir`    | Afficher le menu actuel.                                 |

### Partenariats & objectifs

| Commande               | À quoi ça sert                                               |
| ---------------------- | ------------------------------------------------------------ |
| `/partenaire creer`    | Créer un partenaire (autre org/business).                    |
| `/partenaire objectif` | Fixer son objectif de quantité à fournir (ex. Vagos : 5000). |
| `/partenaire retirer`  | Retirer un partenaire.                                       |
| `/partenaire voir`     | Voir les partenaires et leur progression.                    |

> Pour qu'une commande compte dans l'objectif d'un partenaire, rattache-la :
> `/commande creer … partenaire:Vagos`. La progression s'affiche **en live** dans
> le salon `partenariats` (visible par les employés) dès que la commande est payée.

### Comptabilité de la semaine

| Commande                  | À quoi ça sert                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `/semaine ouvrir`         | Démarrer une nouvelle semaine comptable.                                           |
| `/semaine voir`           | Voir le rapport de la semaine en cours (CA, salaires, classement).                 |
| `/semaine cloturer`       | Clôturer la semaine : fige les chiffres, crée les fiches de paie, publie le bilan. |
| `/semaine cloturer-force` | Clôturer même s'il reste des ventes en attente (Directeur, avec motif).            |
| `/semaine reset`          | Effacer la semaine en cours (⚠️ pour les tests uniquement).                        |

### Paies

| Commande              | À quoi ça sert                                                  |
| --------------------- | --------------------------------------------------------------- |
| `/paie voir`          | Voir les paies de la dernière semaine clôturée.                 |
| `/paie marquer-payee` | Marquer un employé comme payé (une fois l'argent versé en jeu). |

### Gestion des employés

| Commande            | À quoi ça sert                                               |
| ------------------- | ------------------------------------------------------------ |
| `/employe associer` | Lier un membre Discord à son casier (nom RP + salon casier). |
| `/employe archiver` | Archiver un employé qui quitte (garde son historique).       |

### Correction de la comptabilité (en cas d'erreur)

| Commande                    | À quoi ça sert                                                         |
| --------------------------- | ---------------------------------------------------------------------- |
| `/gestion voir`             | Détail chiffré de la semaine pour repérer une entrée erronée.          |
| `/gestion rouvrir-semaine`  | Rouvrir la dernière semaine clôturée pour corriger (puis re-clôturer). |
| `/gestion annuler-commande` | Annuler une commande erronée (même payée).                             |
| `/gestion annuler-vente`    | Annuler une vente erronée (PNJ `HD-` ou main en main `VD-`).           |

> Tout est tracé (audit) et la compta est recalculée depuis la source. Workflow type :
> `rouvrir-semaine` → `annuler-…` → `/semaine cloturer`.

### Outils & réglages

| Commande               | À quoi ça sert                                                 |
| ---------------------- | -------------------------------------------------------------- |
| `/export semaine`      | Exporter ventes + paies en fichiers (CSV) pour archivage.      |
| `/tableau publier`     | Forcer la (re)publication des tableaux permanents.             |
| `/hotzdoggz diagnostic` | Vérifier que tout est bien réglé (rôles, salons, permissions). |
| `/config roles`        | Lier les rôles de grade et de direction.                       |
| `/config salons`       | Lier les salons utilisés par le bot.                           |
| `/config accueil`      | Personnaliser le message de bienvenue.                         |
| `/panel`               | **Panneau de gestion central** : tout piloter depuis Discord.  |

---

## 🎛️ Le panneau de gestion (`/panel`)

`/panel` ouvre une vue d'ensemble (semaine, commandes, partenaires, menu, grille
salariale, **et tous les réglages économiques**) avec un menu déroulant
**« Gérer »** pour tout modifier **sans toucher au code**. Les changements sont
tracés (audit) et n'altèrent jamais l'historique déjà clôturé.

Ce que le menu « Gérer » permet de régler :

| Réglage                       | Effet                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Salaire d'un grade            | Tarif au hot dog d'un grade (s'applique aux futures ventes).                           |
| Menu : ajouter / modifier     | Produit du menu main en main et son prix.                                             |
| Menu : retirer                | Sortir un produit du menu.                                                            |
| Prix de vente PNJ             | Prix encaissé par hot dog vendu au PNJ.                                               |
| Créer un partenaire / objectif| Gérer les partenaires B2B et leurs objectifs hebdo.                                   |
| Créer une commande client     | Enregistrer une commande négociée.                                                   |
| **Répartition des bénéfices** | Réserve %, prime du meilleur %, part Directeur %. Le Co-directeur reçoit le reste.    |
| **Péremption d'un hot dog**   | Durée de vie d'un lot (jours + heures) avant péremption.                              |
| **Seuils anti-fraude**        | Volume max plausible, et seuil de « rafale » (nb de ventes / fenêtre en minutes).    |
| **Rappel clôture & fuseau**   | Jour + plage horaire du rappel du dimanche, et fuseau horaire du serveur.            |

> Les valeurs par défaut suivent le cahier des charges (réserve 5 % · prime 35 % ·
> Directeur 40 % · Co-directeur 25 % ; péremption 6 j 17 h ; fraude > 1000 u ou
> 3 ventes/10 min ; rappel dimanche 20–23 h). Tu ne touches que ce que tu veux changer.

---

## 🖱️ La vérification des ventes (sans commande)

Quand une vente arrive, le bot crée une **fiche** dans `controle-des-ventes`.
Pour une vente **main en main**, la **photo de la facture est jointe directement
à la fiche** : la direction la voit tout de suite, avant même de valider.
La direction la traite avec des **boutons** sur la fiche :

- **Prendre en charge** — je m'occupe de cette vente.
- **Demander complément** — il manque une info (motif obligatoire).
- **Valider** — j'accepte (je saisis la quantité validée + une note).
- **Refuser** — je rejette (motif obligatoire).
- **Corriger** — ajuster une vente déjà validée avant la clôture.

---

## ⭐ Avis clients (salon public, sans commande)

Dans le salon `avis-clients`, un bouton **« Laisser un avis »** permet à
n'importe qui de noter le resto (1 à 5 ⭐ + commentaire, et qui l'a servi). Le bot
affiche les avis et la **note moyenne**. Pour retirer un avis déplacé, il suffit
de **supprimer son message** : la moyenne se recalcule toute seule.

---

## 🔔 Ce que le bot fait tout seul

- Vérifie chaque vente (preuves recyclées, volumes anormaux) et **alerte la direction** si quelque chose cloche.
- **Relance** : ventes en attente de validation depuis +24 h, commande livrée mais pas encaissée, rappel de clôture le dimanche soir.
- Tient à jour les **tableaux** (classement employés, comptabilité, développement de l'entreprise, commandes à réaliser).
- Envoie à chaque employé sa **fiche de paie en privé** à la clôture.
