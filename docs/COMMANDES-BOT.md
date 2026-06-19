# HotzDogz — Les commandes du bot (guide directeur)

Petit mémo de **toutes les commandes** du bot, expliquées simplement.
Sur Discord, tape `/` puis le nom : Discord propose les options automatiquement.
Les réponses du bot ne sont visibles **que par toi** (sauf les tableaux publics).

---

## 👥 Pour tous les employés

| Commande    | À quoi ça sert                                                                 |
| ----------- | ------------------------------------------------------------------------------ |
| `/vendre`   | Déclarer une vente PNJ. L'employé donne la quantité + 2 captures (coffre plein, coffre vide) ; le bot crée le post au bon format et l'envoie en vérification. |
| `/macompta` | Voir sa propre production de la semaine, son salaire provisoire et son écart au meilleur employé (motivation). |

---

## 🛠️ Réservé à la direction

### Commandes client (les vraies commandes de joueurs)

| Commande                | À quoi ça sert                                                        |
| ----------------------- | --------------------------------------------------------------------- |
| `/commande creer`       | Enregistrer une commande négociée : client, volume, prix, échéance.   |
| `/commande contribuer`  | Noter la production d'un employé sur la commande (+ 2 preuves). Ses unités comptent dans son salaire et son classement. |
| `/commande livrer`      | Marquer la commande comme livrée au client (en attente de paiement).  |
| `/commande payer`       | Encaisser (+ preuve de paiement) → le prix rejoint le chiffre d'affaires de la semaine. |
| `/commande voir`        | Afficher l'état d'une commande (progression, contributeurs).          |
| `/commande annuler`     | Annuler une commande (tant qu'elle n'est pas payée).                  |

### Comptabilité de la semaine

| Commande                  | À quoi ça sert                                                      |
| ------------------------- | ------------------------------------------------------------------- |
| `/semaine ouvrir`         | Démarrer une nouvelle semaine comptable.                            |
| `/semaine voir`           | Voir le rapport de la semaine en cours (CA, salaires, classement).  |
| `/semaine cloturer`       | Clôturer la semaine : fige les chiffres, crée les fiches de paie, publie le bilan. |
| `/semaine cloturer-force` | Clôturer même s'il reste des ventes en attente (Directeur, avec motif). |
| `/semaine reset`          | Effacer la semaine en cours (⚠️ pour les tests uniquement).         |

### Paies

| Commande               | À quoi ça sert                                              |
| ---------------------- | ----------------------------------------------------------- |
| `/paie voir`           | Voir les paies de la dernière semaine clôturée.             |
| `/paie marquer-payee`  | Marquer un employé comme payé (une fois l'argent versé en jeu). |

### Gestion des employés

| Commande            | À quoi ça sert                                              |
| ------------------- | ----------------------------------------------------------- |
| `/employe associer` | Lier un membre Discord à son casier (nom RP + salon casier). |
| `/employe archiver` | Archiver un employé qui quitte (garde son historique).       |

### Outils & réglages

| Commande              | À quoi ça sert                                                  |
| --------------------- | --------------------------------------------------------------- |
| `/export semaine`     | Exporter ventes + paies en fichiers (CSV) pour archivage.       |
| `/tableau publier`    | Forcer la (re)publication des tableaux permanents.              |
| `/hotzdogz diagnostic`| Vérifier que tout est bien réglé (rôles, salons, permissions).  |
| `/config roles`       | Lier les rôles de grade et de direction.                        |
| `/config salons`      | Lier les salons utilisés par le bot.                            |

---

## 🖱️ La vérification des ventes (sans commande)

Quand une vente arrive, le bot crée une **fiche** dans `controle-des-ventes`.
La direction la traite avec des **boutons** sur la fiche :

- **Prendre en charge** — je m'occupe de cette vente.
- **Demander complément** — il manque une info (motif obligatoire).
- **Valider** — j'accepte (je saisis la quantité validée + une note).
- **Refuser** — je rejette (motif obligatoire).
- **Corriger** — ajuster une vente déjà validée avant la clôture.

---

## 🔔 Ce que le bot fait tout seul

- Vérifie chaque vente (preuves recyclées, volumes anormaux) et **alerte la direction** si quelque chose cloche.
- **Relance** : ventes en attente de validation depuis +24 h, commande livrée mais pas encaissée, rappel de clôture le dimanche soir.
- Tient à jour les **tableaux** (classement employés, comptabilité, développement de l'entreprise, commandes à réaliser).
- Envoie à chaque employé sa **fiche de paie en privé** à la clôture.
