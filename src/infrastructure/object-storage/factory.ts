import { loadEnv } from '../../config/env.js';
import { logger } from '../logging/logger.js';
import { FilesystemObjectStorage } from './filesystem.js';
import type { ObjectStorage } from './index.js';

let instance: ObjectStorage | undefined;

/**
 * Fournit l'implementation de stockage objet (singleton).
 * Aujourd'hui : fichier local. Un backend S3 (S3_*) pourra etre branche ici
 * sans changer le metier (contrat ObjectStorage).
 */
export function getObjectStorage(): ObjectStorage {
  if (instance) return instance;
  const env = loadEnv();

  if (env.S3_BUCKET) {
    logger.warn(
      'Backend S3 detecte mais non encore implemente : repli sur le stockage fichier local.',
    );
  }

  instance = new FilesystemObjectStorage(env.STORAGE_DIR);
  return instance;
}
