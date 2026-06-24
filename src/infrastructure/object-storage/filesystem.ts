import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ObjectStorage, PutObjectInput, StoredObjectInfo } from './index.js';

/**
 * Stockage objet sur le systeme de fichiers (copie durable des preuves, §5.3).
 *
 * Convient au developpement local et a un VPS avec disque persistant. Pour un
 * hebergement ephemere (Railway/Render), brancher un backend S3 via le meme
 * contrat (cf. factory.ts).
 *
 * Securite : les cles sont confinees sous `baseDir` (pas de remontee `..`).
 */
export class FilesystemObjectStorage implements ObjectStorage {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = isAbsolute(baseDir) ? baseDir : resolve(process.cwd(), baseDir);
  }

  private pathFor(key: string): string {
    const target = resolve(this.baseDir, key);
    // Confinement multi-plateforme (Windows/Linux) : la cible doit rester
    // strictement sous baseDir, sans remontee `..`.
    const rel = relative(this.baseDir, target);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Cle de stockage invalide (hors du repertoire de base) : ${key}`);
    }
    return target;
  }

  async put(input: PutObjectInput): Promise<{ key: string }> {
    const target = this.pathFor(input.key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.body);
    return { key: input.key };
  }

  async getSignedUrl(key: string): Promise<string> {
    // Pas de signature pour le FS : on renvoie un file:// stable.
    return pathToFileURL(this.pathFor(key)).toString();
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  /** Relit les octets d'un objet stocke. */
  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  /** Alias historique (tests / verification d'integrite). */
  async read(key: string): Promise<Buffer> {
    return this.get(key);
  }

  /**
   * Inventaire recursif des objets sous `baseDir` (ou sous `prefix`). Les cles
   * sont normalisees en chemins POSIX (`/`) pour matcher celles stockees en base.
   */
  async list(prefix = ''): Promise<StoredObjectInfo[]> {
    const out: StoredObjectInfo[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return; // repertoire absent (rien a lister)
      }
      for (const entry of entries) {
        const abs = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(abs);
        } else if (entry.isFile()) {
          const key = relative(this.baseDir, abs).split(sep).join('/');
          if (prefix && !key.startsWith(prefix)) continue;
          const s = await stat(abs);
          out.push({ key, size: s.size, modifiedAt: s.mtime });
        }
      }
    };
    await walk(this.baseDir);
    return out;
  }

  /** Supprime un objet puis elague les repertoires devenus vides (jusqu'a baseDir). */
  async delete(key: string): Promise<void> {
    const target = this.pathFor(key);
    await rm(target, { force: true });
    // Elagage des dossiers vides remontant vers baseDir (sans jamais le supprimer).
    let dir = dirname(target);
    while (dir !== this.baseDir && dir.startsWith(this.baseDir)) {
      try {
        await rmdir(dir); // echoue si non vide => on s'arrete
      } catch {
        break;
      }
      dir = dirname(dir);
    }
  }
}

/** Empreinte SHA-256 d'un contenu binaire (§5.3). */
export function sha256(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}
