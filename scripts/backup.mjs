// Sauvegarde de la base PostgreSQL (CDC §10.4).
// Usage : npm run backup
// Variables : DATABASE_URL (requis), BACKUP_DIR (def. ./backups),
//   BACKUP_RETENTION_DAYS (def. 14), PG_DUMP (chemin de pg_dump si hors PATH).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv();

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error('DATABASE_URL manquant (.env).');
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

const pgDump = process.env.PG_DUMP || 'pg_dump';
const dir = process.env.BACKUP_DIR || 'backups';
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/:/g, '-').replace('T', '_').slice(0, 16);
const file = join(dir, `hotzdoggz-${stamp}.dump`);

// Format custom (-Fc) : compresse et permet une restauration selective.
const res = spawnSync(pgDump, ['-Fc', '--no-owner', '-d', url, '-f', file], { stdio: 'inherit' });
if (res.error || res.status !== 0) {
  console.error(
    'Echec de pg_dump. Verifie que pg_dump est installe et dans le PATH ' +
      '(sinon definis PG_DUMP=chemin\\vers\\pg_dump.exe).',
  );
  process.exit(1);
}
console.log('Sauvegarde creee :', file);

// Purge des sauvegardes plus anciennes que la retention.
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 14);
const cutoff = Date.now() - retentionDays * 86_400_000;
for (const name of readdirSync(dir)) {
  if (!name.startsWith('hotzdoggz-') || !name.endsWith('.dump')) continue;
  const p = join(dir, name);
  if (statSync(p).mtimeMs < cutoff) {
    unlinkSync(p);
    console.log('Ancienne sauvegarde supprimee :', name);
  }
}
