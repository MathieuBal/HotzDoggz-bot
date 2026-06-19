# Guide clé en main — HotzDogz Bot

Ce guide t'amène de zéro à un bot **fonctionnel et branché sur ton serveur**.
Aucune connaissance technique poussée requise : suis les étapes dans l'ordre.

Temps estimé : 30–45 min.

---

## 0. Ce qu'il te faut

- Un **serveur Discord** où tu es administrateur.
- **Node.js 20+** installé ([nodejs.org](https://nodejs.org)).
- **Docker Desktop** (le plus simple pour la base) — ou un PostgreSQL existant.
- 10 minutes pour préparer les salons/rôles.

> 💡 Tu fais TOUTE la configuration depuis Discord avec la commande `/config`.
> Tu n'as **pas** besoin de copier des IDs de salons à la main.

---

## 1. Préparer le serveur Discord

### 1.1 Les rôles (s'ils n'existent pas déjà)

Crée/identifie ces rôles (Paramètres du serveur → Rôles) :

`Directeur` · `Co-directeur` · `Chef d'équipe` · `Expérimenté` · `Novice` · `Stagiaire`

### 1.2 Les salons de gestion

Crée une catégorie privée (ex. **DIRECTION**) visible par la direction + le bot,
avec :

| Salon                   | Type      | Rôle dans le bot                      |
| ----------------------- | --------- | ------------------------------------- |
| `controle-des-ventes`   | **Forum** | Fiches de contrôle (1 post par vente) |
| `comptabilite`          | Texte     | Tableau comptable + bilan de clôture  |
| `paies`                 | Texte     | (réservé aux paies)                   |
| `logs-et-archives`      | Texte     | Alertes et journal lisible            |
| `tableau-de-bord-hebdo` | Texte     | Tableau employés + grille salariale   |

> ⚠️ Sur le **Forum `controle-des-ventes`**, NE COCHE PAS « Obliger à choisir un
> tag pour publier » (sinon le bot ne peut pas créer les fiches).

Et **un salon côté employés** (catégorie visible par toute l'équipe + le bot) :

| Salon           | Type  | Rôle dans le bot                                               |
| --------------- | ----- | -------------------------------------------------------------- |
| `developpement` | Texte | Tableau « Développement de l'entreprise » (croissance, public) |

> 💡 Ce salon ne montre que la croissance (ventes, CA, nouveaux, promotions,
> top vendeurs) — **jamais** les marges ni les salaires/primes de direction. Le
> bot n'a besoin que d'y **voir + écrire + intégrer des liens**.

### 1.3 Les casiers employés (Forums privés)

Chaque employé a **un salon Forum privé** (son casier), visible par lui + la
direction + le bot. Pour un premier test, un seul casier suffit.

Sur chaque casier, crée ces **6 tags** (le bot les reconnaît par leur nom) :

`Nouvelle vente` · `À vérifier` · `À compléter` · `Validée` · `Payée` · `Refusée`

---

## 2. Créer le bot (Discord Developer Portal)

1. Va sur https://discord.com/developers/applications → **New Application**,
   nomme-la _HotzDogz_.
2. Onglet **Bot** :
   - clique **Reset Token** → **copie le token** (tu le mettras dans `.env`).
   - Active **MESSAGE CONTENT INTENT** et **SERVER MEMBERS INTENT** (obligatoire).
3. Onglet **General Information** → copie l'**Application ID**
   (c'est ton `DISCORD_CLIENT_ID`).

### 2.1 Inviter le bot sur ton serveur

Onglet **OAuth2 → URL Generator** :

- **Scopes** : `bot` + `applications.commands`
- **Bot Permissions** : `View Channels`, `Send Messages`, `Create Public Threads`,
  `Send Messages in Threads`, `Manage Threads`, `Embed Links`, `Attach Files`,
  `Read Message History`
  _(surtout pas Administrateur)_

Copie l'URL générée en bas, ouvre-la, choisis ton serveur, **Autoriser**.

> Vérifie ensuite que le bot a bien accès (View Channel) à la catégorie DIRECTION
> et à chaque casier. Au besoin, ajoute une permission de salon pour le rôle du bot.

---

## 3. Récupérer l'ID de ton serveur

Active le **Mode développeur** : Paramètres Discord → Avancés → Mode développeur.
Puis clic droit sur l'icône de ton serveur → **Copier l'identifiant du serveur**
(= ton `DISCORD_GUILD_ID`).

---

## 4. Installer et lancer le bot (en local)

```bash
# 1) Récupérer le code
git clone <url-de-ton-repo> hotzdogz-bot
cd hotzdogz-bot
git checkout claude/relaxed-lovelace-t14z5i

# 2) Dépendances
npm install

# 3) Configurer l'environnement
cp .env.example .env
```

Ouvre `.env` et renseigne **seulement ces 4 lignes** :

```ini
DISCORD_TOKEN=ton_token_du_bot
DISCORD_CLIENT_ID=ton_application_id
DISCORD_GUILD_ID=l_id_de_ton_serveur
DATABASE_URL=postgresql://hotzdogz:hotzdogz@localhost:5432/hotzdogz?schema=public
```

```bash
# 4) Base de données
docker compose up -d postgres     # démarre PostgreSQL
npx prisma migrate deploy         # crée les tables

# 5) Démarrer le bot
npm run dev
```

Quand le terminal affiche **« Bot connecté »**, le bot est en ligne et a
enregistré ses commandes sur ton serveur. Laisse cette fenêtre ouverte.

---

## 5. Configurer le bot depuis Discord

Dans ton serveur (les réponses sont privées) :

1. **Lier les rôles** — tape `/config roles` et sélectionne chaque rôle :

   ```
   /config roles directeur:@Directeur co_directeur:@Co-directeur
           chef_equipe:@Chef d'équipe experimente:@Expérimenté
           novice:@Novice stagiaire:@Stagiaire
   ```

   (la grille salariale 145/155/165/175/185 est appliquée automatiquement)

2. **Lier les salons** — tape `/config salons` :

   ```
   /config salons controle:#controle-des-ventes comptabilite:#comptabilite
           paies:#paies logs:#logs-et-archives tableau:#tableau-de-bord-hebdo
           developpement:#developpement
   ```

   (`developpement` est le salon employés du tableau de croissance ; si tu ne le
   renseignes pas, ce tableau retombe dans `tableau-de-bord-hebdo`)

3. **Associer un employé à son casier** :

   ```
   /employe associer membre:@Pseudo nom_rp:Mathieu casier:#casier-mathieu
   ```

   (le bot cartographie tout seul les 6 tags du casier)

4. **Vérifier que tout est au vert** :

   ```
   /hotzdogz diagnostic
   ```

   Corrige ce qui est ❌ ou ⚠️, puis relance jusqu'au tout vert.

5. **Ouvrir la semaine comptable** :
   ```
   /semaine ouvrir
   ```
   (les tableaux permanents apparaissent dans `tableau-de-bord-hebdo`,
   `comptabilite` et `developpement`)

---

## 6. Tester un cycle complet

1. **L'employé déclare** dans son casier. Il crée un post :
   - **Titre** : `VENTE - 2000 hot dogs - 18/06/2026`
   - **Message** : `Quantité vendue : 2000`
   - **2 images** jointes (coffre plein, puis coffre vide)
   - **Tag** : `Nouvelle vente`
     → Le bot répond, met le casier en « À vérifier » et crée une **fiche** dans
     `controle-des-ventes`.

2. **La direction contrôle** depuis la fiche : **Prendre en charge** → **Valider**
   (saisir la quantité validée + une note). Le tableau hebdo se met à jour.

3. **Clôture** : `/semaine cloturer` → bouton **Confirmer**. Les fiches de paie
   sont créées et le bilan publié dans `comptabilite`.

4. **Paiement** : `/paie voir`, puis `/paie marquer-payee membre:@Pseudo`.

5. **Export** : `/export semaine` → 2 fichiers CSV (ventes + paies).

6. **Bonus employé** : chaque employé peut faire `/macompta` pour voir sa
   production et son écart au meilleur employé (hors patrons).

🎉 Si ce cycle passe, ton bot est pleinement opérationnel.

---

## 7. Permissions du bot par salon (récap)

| Salon                       | Permissions du bot                                                           |
| --------------------------- | ---------------------------------------------------------------------------- |
| Forum `controle-des-ventes` | Voir, Créer des posts, Envoyer dans les fils, Gérer les fils, Joindre, Embed |
| Casiers (Forums)            | Voir, Envoyer dans les fils, Gérer les fils, Lire l'historique               |
| Salons texte (compta, etc.) | Voir, Envoyer des messages, Embed, Joindre des fichiers                      |
| `developpement` (employés)  | Voir, Envoyer des messages, Embed                                            |

---

## 8. Dépannage

| Symptôme                                       | Cause / solution                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Le bot ne se connecte pas / crash au démarrage | Intents non activés : coche **Message Content** + **Server Members** (étape 2). |
| Les commandes `/` n'apparaissent pas           | Attends ~1 min, ou relance `npm run dev` ; vérifie `DISCORD_GUILD_ID`.          |
| « Configuration absente »                      | Lance d'abord `/config roles` et `/config salons`.                              |
| La fiche de contrôle n'est pas créée           | `controle-des-ventes` doit être un **Forum** sans tag obligatoire.              |
| Le tag du casier ne change pas                 | Donne au bot **Gérer les fils** sur le casier ; vérifie les noms des 6 tags.    |
| « Déclaration incomplète »                     | Il manque le tag `Nouvelle vente`, une des 2 images, ou la quantité.            |
| Erreur de connexion à la base                  | `docker compose up -d postgres` lancé ? `DATABASE_URL` correct ?                |

---

## 8.bis Fonctions automatiques (rien à configurer)

Ces trois mécanismes tournent tout seuls une fois le bot lancé :

- **🛡️ Contrôle d'intégrité (anti-fraude).** À chaque vente, le bot repère les
  preuves déjà utilisées (🔴), les volumes anormaux et les rafales de
  déclarations (🟠). Le repère s'affiche sur la fiche de contrôle et la
  direction est alertée dans `logs-et-archives`. Le bot **signale**, il ne
  bloque jamais : c'est la direction qui tranche.
- **📊 Tableau « Développement de l'entreprise ».** Un message permanent dans le
  salon employés `developpement` (ou, à défaut, dans `tableau-de-bord-hebdo`) :
  hot dogs vendus, chiffre d'affaires, ventes, vendeurs actifs, nouveaux
  employés, promotions et top vendeurs — comparés à la semaine précédente.
  Aucune donnée de répartition (marges, salaires/primes de direction) n'y figure.
- **🔔 Relances automatiques.** Le bot rappelle les ventes en attente de
  validation depuis plus de 24 h, propose de clôturer le dimanche soir si la
  semaine est encore ouverte, et envoie à chaque employé sa **fiche de paie en
  message privé** à la clôture.

## 9. Checklist finale

- [ ] Rôles créés et liés (`/config roles`)
- [ ] Salons de gestion créés et liés (`/config salons`, dont `developpement`)
- [ ] Au moins un casier (Forum) avec les 6 tags, employé associé
- [ ] `/hotzdogz diagnostic` tout au vert
- [ ] `/semaine ouvrir` effectué, tableaux visibles
- [ ] Cycle test déclaration → validation → clôture → paie → export OK

> Besoin d'un hébergement permanent (le bot tourne 24/7 sans ton PC) ? C'est la
> Phase 6 : un `Dockerfile` de production est déjà prêt. Dis-le-moi et je te
> prépare le déploiement (Railway/Render/VPS) + sauvegardes.
