import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ObjectStorage, PutObjectInput } from './index.js';

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
}

/** Empreinte SHA-256 d'un contenu binaire (§5.3). */
export function sha256(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}
