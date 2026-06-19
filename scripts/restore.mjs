// Restauration de la base PostgreSQL depuis une sauvegarde (CDC §10.4).
// Usage : npm run restore -- backups/hotzdoggz-AAAA-MM-JJ_HH-MM.dump
// ATTENTION : ecrase les donnees actuelles de la base ciblee par DATABASE_URL.
// Variables : DATABASE_URL (requis), PG_RESTORE (chemin si hors PATH).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';

loadEnv();

const rawUrl = process.env.DATABASE_URL;
const file = process.argv[2];
if (!rawUrl || !file) {
  console.error('Usage : npm run restore -- <fichier.dump>');
  process.exit(1);
}

// Retire les parametres propres a Prisma (ex. ?schema=public) que libpq ignore.
function toLibpqUrl(value) {
  try {
    const u = new URL(value);
    u.searchParams.delete('schema');
    u.searchParams.delete('connection_limit');
    u.searchParams.delete('pool_timeout');
    if ([...u.searchParams.keys()].length === 0) u.search = '';
    return u.toString();
  } catch {
    return value;
  }
}
const url = toLibpqUrl(rawUrl);
if (!existsSync(file)) {
  console.error('Fichier introuvable :', file);
  process.exit(1);
}

const pgRestore = process.env.PG_RESTORE || 'pg_restore';
// --clean --if-exists : supprime les objets existants avant de restaurer.
const res = spawnSync(pgRestore, ['--clean', '--if-exists', '--no-owner', '-d', url, file], {
  stdio: 'inherit',
});
if (res.error || res.status !== 0) {
  console.error(
    'Echec de pg_restore. Verifie que pg_restore est installe et dans le PATH ' +
      '(sinon definis PG_RESTORE=chemin\\vers\\pg_restore.exe).',
  );
  process.exit(1);
}
console.log('Restauration terminee depuis :', file);
