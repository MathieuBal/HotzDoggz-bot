# HotzDogz · Bot de gestion

Bot Discord de gestion d'entreprise pour le restaurant RP **HotzDogz** (GTA RP) :
détection des ventes au PNJ, contrôle par la direction, comptabilité hebdomadaire,
paies et audit.

> **Principe non négociable** : le bot ne déclare jamais une vente à la place de
> l'employé. Il détecte, contrôle, orchestre la validation humaine, calcule,
> archive et trace tout ce qui suit la création du post. PostgreSQL est la source
> officielle ; Discord n'est que l'interface.

Le développement suit le cahier des charges interne (v1.0, 18 juin 2026) et sa
roadmap par phases.

## État d'avancement

| Phase                           | Contenu                                                                                                                                  | Statut          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **1 — Fondations techniques**   | TypeScript · discord.js · PostgreSQL · Prisma · Docker Compose · schéma + migrations + seed · connexion bot · diagnostic · logs · CI     | ✅ **en place** |
| **2 — Détection & ingestion**   | association employé-casier, `threadCreate` + fallback `messageCreate`, contrôles, idempotence, copie durable des preuves, fiche contrôle | ✅ **en place** |
| **3 — Workflow de validation**  | boutons/modals direction, synchronisation des tags, validation/complément/refus/correction, audit                                        | ✅ **en place** |
| **4 — Comptabilité temps réel** | journal financier, tableaux permanents, classement & prime                                                                               | ✅ **en place** |
| **5 — Clôture & paies**         | clôture stricte/forcée, fiches de paie, paiements, exports                                                                               | ✅ **en place** |
| 6 — Durcissement & prod         | tests de charge, sauvegardes/restauration, déploiement permanent                                                                         | ⏳              |

## Décisions métier figées

- **Grille salariale** (salaire par hot dog validé) :
  Stagiaire 145 $ · Novice 155 $ · Expérimenté 165 $ · Chef d'équipe 175 $ ·
  **Direction (Directeur & Co-directeur) 185 $**.
  Le salaire de production de la direction s'ajoute à sa part du bénéfice
  (40 % / 25 %) ; la direction reste **exclue de la prime** du meilleur employé.
- **Comptabilité** (calculs sur les totaux hebdomadaires, montants entiers) :
  - `reserve = floor(CA × 5 %)` (jamais utilisée pour payer)
  - `benefice = CA − salaires − reserve`
  - `prime = floor(benefice × 35 %)`, `directeur = floor(benefice × 40 %)`,
    `co-directeur = reste` (absorbe le résidu d'arrondi).

## Stack

TypeScript · Node.js 22 · [discord.js](https://discord.js.org/) ·
PostgreSQL · [Prisma](https://www.prisma.io/) · [Zod](https://zod.dev/) ·
[Pino](https://getpino.io/) · [Vitest](https://vitest.dev/) · Docker Compose.

## Prérequis

- Node.js ≥ 20 (22 recommandé) et npm
- Docker + Docker Compose (PostgreSQL local), **ou** un PostgreSQL accessible
- Une application Discord (token + client id) — voir le Developer Portal

## Installation

```bash
npm install
cp .env.example .env        # puis renseigner les valeurs
```

Variables minimales dans `.env` : `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`,
`DISCORD_GUILD_ID`, `DATABASE_URL`. Les **intents privilégiés**
`MessageContent` et `GuildMembers` doivent être activés dans le Developer Portal,
sinon la connexion Gateway échoue.

## Base de données

```bash
# Démarre PostgreSQL en local (port 5432)
docker compose up -d postgres

# Applique les migrations
npx prisma migrate deploy        # ou: npm run prisma:migrate (dev)

# Seed de configuration (lit les IDs depuis .env, idempotent)
npm run db:seed
```

Le seed crée/MAJ la `GuildConfig` du serveur et la grille `GradeRate` pour les
rôles renseignés. Un changement de tarif **clôt** l'ancien et en crée un nouveau
(l'historique n'est jamais réécrit).

## Lancer le bot

```bash
# Développement (rechargement à chaud)
npm run dev

# Enregistrer les slash commands (instantané si DISCORD_GUILD_ID est défini)
npm run commands:deploy

# Production
npm run build && npm start
```

### Tout-en-un avec Docker

```bash
docker compose up --build      # PostgreSQL + bot (migrations appliquées au démarrage)
```

## Commandes disponibles

> **Accès :** les commandes de gestion sont **masquées aux membres normaux**
> (permission « Gérer le serveur ») ; `/vendre` et `/macompta` restent ouvertes à
> tous les employés. Pour autoriser un rôle (ex. Co-directeur sans « Gérer le
> serveur ») : Paramètres du serveur → Intégrations → HotzDoggz → Permissions des
> commandes.

- `/vendre <quantite> <preuve_avant> <preuve_apres> [commentaire]` — **déclaration
  assistée** : le bot crée le post au bon format dans le casier de l'employé et
  enregistre la vente (format garanti). Ouvert à tout employé.
- `/config roles` / `/config salons` — lie les rôles et les salons au bot
  directement depuis Discord (gestionnaires du serveur), sans copier d'IDs.
- `/hotzdogz diagnostic` — vérifie rôles, salons, permissions du bot, tags,
  tarifs de grade, casiers, messages permanents et semaine comptable ouverte
  (réponse éphémère).
- `/employe associer <membre> <nom_rp> <casier>` — lie un membre à son Forum
  casier et cartographie automatiquement les tags du casier (direction).
- `/employe archiver <membre>` — désactive un employé en conservant son
  historique (empêche les nouvelles déclarations).
- `/semaine ouvrir` — ouvre une semaine comptable (lundi→dimanche, Europe/Paris),
  reprend les posts en attente et publie les tableaux (direction).
- `/semaine voir` — affiche le rapport de la semaine ouverte (éphémère).
- `/tableau publier` — (re)crée ou actualise les tableaux permanents (direction).
- `/macompta` — fiche perso (privée) : production, salaire provisoire, rang et
  **écart au meilleur employé** (calculé hors direction/co-patron, pour motiver).
- `/semaine cloturer` — clôture stricte avec aperçu + bouton de confirmation
  (refusée s'il reste des ventes en cours) (direction).
- `/semaine cloturer-force` — clôture forcée : modal motif + double confirmation,
  **Directeur uniquement**, intégralement auditée.
- `/semaine reset` — supprime la semaine ouverte et ses ventes/paies (tests),
  avec confirmation (direction).
- `/paie voir` — paies de la dernière semaine clôturée (direction).
- `/paie marquer-payee <membre>` — confirme le versement en jeu (anti-double
  paiement) (direction).
- `/export semaine` — exporte la dernière semaine clôturée en CSV (ventes +
  paies) (direction).

## Flux d'ingestion (Phase 2)

Lorsqu'un employé crée un post dans son casier (`threadCreate`, fallback
`messageCreate` si le message initial arrive après) :

1. Idempotence par `threadId` (jamais deux fois la même vente).
2. Contrôles (CDC §4.3) : propriétaire du casier, tag « Nouvelle vente »,
   ≥ 2 captures, quantité exploitable, semaine ouverte.
3. Selon le verdict : **refus technique** (auteur ≠ propriétaire), **à
   compléter** (manques listés dans le casier, aucun calcul), **en attente**
   (pas de semaine ouverte) ou **accepté**.
4. Si accepté : copie durable des 2 preuves (SHA-256 + stockage objet),
   création transactionnelle de la vente (statut `SOUMISE` + snapshots
   grade/tarif/prix), génération de la référence `HD-AAAA-NNNN`, création de la
   **fiche de contrôle** dans le Forum de direction et notification.
5. Le tag du casier passe à « À vérifier » et l'employé reçoit sa référence.

Au démarrage, le bot **réconcilie** les posts actifs des casiers créés
pendant qu'il était hors ligne (sans doublon).

## Workflow de validation (Phase 3)

La fiche de contrôle porte des boutons (réservés à la direction), actifs selon
le statut de la vente (machine à états §4.8) :

- **Prendre en charge** — assigne le contrôleur (`SOUMISE`→`EN_VERIFICATION`),
  avec verrou optimiste : en cas de double clic, un seul réussit (§11).
- **Demander un complément** — modal motif → `INCOMPLETE`, casier en « À
  compléter », aucun effet financier.
- **Valider** — modal (quantité validée, note PC, commentaire). **Bloqué** si
  anomalie de grade (corriger les rôles d'abord, §11). Transaction unique :
  fige quantité + snapshots, écrit le **journal financier** (`SALE_REVENUE` +
  `SALARY_LIABILITY`), historise et audite (§9.4).
- **Refuser** — modal motif obligatoire → `REFUSEE`, dossier conservé.
- **Corriger** (avant clôture) — nouvelle quantité validée ; ancien et nouveau
  montants conservés, écriture d'`ADJUSTMENT`. Les tableaux de semaine se
  rafraîchissent automatiquement (Phase 4), les totaux restant dérivés des
  ventes validées (§6.1).

Chaque action rafraîchit la fiche, synchronise le tag du casier et répond à
l'employé. Toutes les transitions interdites sont refusées et tracées.

## Comptabilité temps réel (Phase 4)

Les totaux sont **dérivés des ventes validées** (jamais des messages, §6.1) :

- **Tableaux permanents** édités en place par le bot (le même message est
  modifié, son ID est conservé ; recréé s'il a été supprimé, §5.5/§7.4) :
  - _Tableau hebdomadaire employés_ — classement par quantité validée, salaire
    provisoire, grade, meilleur employé et **prime provisoire** (direction
    exclue, gestion de l'égalité).
  - _Tableau comptable direction_ — CA, salaires, réserve (5 %), bénéfice,
    parts 35/40/25 et dossiers en attente.
  - _Grille salariale_ — prix PNJ et tarifs par grade.
- Les mises à jour sont **debouncées** (coalescées) puis **sérialisées** par
  serveur, pour éviter d'éditer plusieurs fois le même message et de heurter les
  limites de l'API Discord.
- À la **validation**, le journal financier reçoit `SALE_REVENUE` et
  `SALARY_LIABILITY` ; une correction ajoute un `ADJUSTMENT`. Les montants
  restent recalculables depuis les ventes.

## Clôture & paies (Phase 5)

- **Clôture stricte** (`/semaine cloturer`) : aperçu du bilan + bouton de
  confirmation. Refusée tant que des ventes sont en cours (§6.6).
- **Clôture forcée** (`/semaine cloturer-force`, Directeur) : modal motif +
  double confirmation (taper `CLOTURER`), intégralement auditée.
- À la clôture, dans **une seule transaction** : verrouillage des totaux sur la
  semaine, désignation du meilleur employé (prime partagée en cas d'égalité),
  création des **fiches de paie** (salaire + prime), écritures d'allocation
  (réserve, prime, parts directeur/co-directeur), intégration des ventes
  validées. Le bilan final est publié dans `comptabilité` et les tableaux sont
  réinitialisés.
- **Paiement** (`/paie marquer-payee`) : verrouille la fiche, enregistre payeur
  et date, passe les ventes liées à `PAYEE`. **Impossible de payer deux fois**
  sans correction.
- **Export** (`/export semaine`) : CSV ventes + CSV paies de la dernière semaine
  clôturée.

## Mise en route sur un serveur Discord (test)

> 📘 **Guide pas-à-pas complet (clé en main)** : [`docs/GUIDE-INSTALLATION.md`](docs/GUIDE-INSTALLATION.md)
> — création du bot, structure des salons, liaison via `/config`, scénario de test.

1. **Application Discord** — sur le [Developer Portal](https://discord.com/developers/applications) :
   créer une application, onglet _Bot_ → copier le **token** ; activer
   **MESSAGE CONTENT INTENT** et **SERVER MEMBERS INTENT**. Onglet _OAuth2_ →
   copier l'**Application ID** (= `DISCORD_CLIENT_ID`).
2. **Inviter le bot** — OAuth2 → URL Generator, scopes `bot` + `applications.commands`,
   permissions : View Channels, Send Messages, Send Messages in Threads, Embed
   Links, Attach Files, Manage Threads, Read Message History (pas Administrateur).
3. **Récupérer les IDs Discord** (mode développeur activé) : serveur (guild),
   rôles de grade/direction, salons (Forum de contrôle, comptabilité, paies,
   logs, tableau hebdo), et les Forums casiers.
4. **Configurer** — `cp .env.example .env`, renseigner `DISCORD_TOKEN`,
   `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `DATABASE_URL`, puis les
   `ROLE_*` et `CHANNEL_*`.
5. **Base + démarrage** :
   ```bash
   npm install
   docker compose up -d postgres      # ou un PostgreSQL existant
   npx prisma migrate deploy
   npm run db:seed                    # GuildConfig + grille salariale
   npm run dev                        # démarre le bot (commandes auto-synchro)
   ```
6. **Vérifier** dans Discord : `/hotzdogz diagnostic` (doit être au vert),
   associer les employés `/employe associer`, ouvrir la semaine
   `/semaine ouvrir`, puis tester un cycle complet : un employé poste une vente
   dans son casier → la direction valide depuis la fiche de contrôle →
   `/semaine cloturer` → `/paie marquer-payee` → `/export semaine`.

## Scripts npm

| Script                            | Rôle                          |
| --------------------------------- | ----------------------------- |
| `npm run dev`                     | Bot en mode watch (tsx)       |
| `npm run build` / `npm start`     | Compilation puis exécution    |
| `npm test`                        | Tests unitaires (Vitest)      |
| `npm run lint` / `npm run format` | ESLint / Prettier             |
| `npm run prisma:migrate`          | Migration de dev              |
| `npm run prisma:deploy`           | Applique les migrations (CI)  |
| `npm run db:seed`                 | Seed de configuration         |
| `npm run commands:deploy`         | Enregistre les slash commands |

## Structure du dépôt

```
src/
  config/          env (Zod) + constantes métier
  discord/         client, events, commands (buttons/modals à venir)
  modules/         logique métier testable
    accounting/    calculs comptables (purs)
    employees/     grade + service employés/casiers
    lockers/       cartographie et application des tags de Forum
    sales/         ingestion, quantité, références, preuves, réconciliation
    verification/  fiche de contrôle
    audit/         journal d'audit
  infrastructure/  database (Prisma), logging (Pino), object-storage, scheduling
  index.ts         point d'entrée (processus permanent)
prisma/            schema + migrations + seed
tests/             tests unitaires des règles
```

## Tests

```bash
npm test
```

Couvre les règles comptables (réserve, bénéfice, répartition 35/40/25 avec résidu
au Co-directeur, exemple du CDC §1.5), la résolution de grade et les références de
vente. C'est le cœur de l'intégrité comptable : à étendre à chaque phase.

## Intégration continue

`.github/workflows/ci.yml` exécute, à chaque push/PR : `lint`, `build`, `test`,
puis applique les migrations sur un PostgreSQL jetable et vérifie leur cohérence.

## Sécurité

Secrets uniquement dans l'environnement (`.env` ignoré par Git, seul
`.env.example` est versionné). Ne jamais donner la permission Administrateur au
bot : se limiter aux salons utiles (principe de moindre privilège).
