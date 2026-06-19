# Sauvegardes & restauration

La comptabilité du bot vit dans PostgreSQL : **c'est la donnée critique**. Ce
guide explique comment la sauvegarder et la restaurer (CDC §10.4).

## Sauvegarder

```bash
npm run backup
```

- Crée un fichier dans `backups/hotzdoggz-AAAA-MM-JJ_HH-MM.dump` (format compressé).
- Supprime automatiquement les sauvegardes de plus de **14 jours** (configurable
  via `BACKUP_RETENTION_DAYS`).

> ⚠️ Le script utilise **`pg_dump`**. S'il n'est pas reconnu, ajoute le dossier
> `bin` de PostgreSQL au PATH, **ou** définis son chemin dans `.env` :
>
> ```ini
> PG_DUMP=C:\Program Files\PostgreSQL\18\bin\pg_dump.exe
> PG_RESTORE=C:\Program Files\PostgreSQL\18\bin\pg_restore.exe
> ```

## Restaurer

> ⚠️ **Écrase** les données actuelles de la base ciblée par `DATABASE_URL`.

```bash
npm run restore -- backups/hotzdoggz-2026-06-18_20-00.dump
```

## Automatiser (recommandé)

### Windows — Planificateur de tâches

1. Ouvre **Planificateur de tâches** → **Créer une tâche de base**.
2. Déclencheur : **Quotidien** (ex. 04:00).
3. Action : **Démarrer un programme**
   - Programme : `C:\Program Files\nodejs\node.exe`
   - Arguments : `scripts/backup.mjs`
   - Commencer dans : le dossier du projet (ex. `K:\Python\HotzDoggz-bot`)
4. Termine. La sauvegarde tournera tous les jours.

### Linux / VPS — cron

```cron
0 4 * * * cd /opt/hotzdoggz-bot && /usr/bin/node scripts/backup.mjs >> backups/backup.log 2>&1
```

## Bonnes pratiques (CDC §10.4)

- **Tester la restauration** au moins une fois (sur une base de test) avant de
  compter dessus.
- **Sortir les sauvegardes du serveur** régulièrement (copie sur un autre
  disque / cloud) — une sauvegarde sur la même machine ne protège pas d'une
  panne disque.
- Faire une sauvegarde **avant chaque mise à jour** importante du bot.
- Les **preuves** (images) sont dans `STORAGE_DIR` (`./storage` par défaut) :
  sauvegarde aussi ce dossier si tu veux conserver les captures.
