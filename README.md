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

| Phase                         | Contenu                                                                                                                                  | Statut          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **1 — Fondations techniques** | TypeScript · discord.js · PostgreSQL · Prisma · Docker Compose · schéma + migrations + seed · connexion bot · diagnostic · logs · CI     | ✅ **en place** |
| 2 — Détection & ingestion     | association employé-casier, `threadCreate` + fallback `messageCreate`, contrôles, idempotence, copie durable des preuves, fiche contrôle | ⏳ à venir      |
| 3 — Workflow de validation    | boutons/modals direction, synchronisation des tags, validation/complément/refus/correction, audit                                        | ⏳              |
| 4 — Comptabilité temps réel   | journal financier, tableaux permanents, classement & prime                                                                               | ⏳              |
| 5 — Clôture & paies           | clôture stricte/forcée, fiches de paie, paiements, exports                                                                               | ⏳              |
| 6 — Durcissement & prod       | tests de charge, sauvegardes/restauration, déploiement permanent                                                                         | ⏳              |

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

## Commande disponible (Phase 1)

- `/hotzdogz diagnostic` — vérifie rôles, salons, permissions du bot, tags,
  tarifs de grade, casiers, messages permanents et semaine comptable ouverte
  (réponse éphémère).

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
    employees/     résolution de grade
    sales/         références de vente
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
