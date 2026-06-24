/**
 * Stockage objet des preuves (CDC §5.3) — interface.
 *
 * Les URLs de pieces jointes Discord sont signees et expirent : une copie
 * durable externe est obligatoire (§14). Implementation par defaut : fichier
 * local (cf. ./filesystem.ts) ; un backend S3/MinIO/R2 pourra etre branche via
 * le meme contrat (cf. ./factory.ts).
 */

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

/** Metadonnees d'un objet stocke (inventaire pour la purge §5.3). */
export interface StoredObjectInfo {
  key: string;
  size: number;
  modifiedAt: Date;
}

export interface ObjectStorage {
  put(input: PutObjectInput): Promise<{ key: string }>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  exists(key: string): Promise<boolean>;
  /** Relit les octets d'un objet (ex. ré-attacher une image au menu). */
  get(key: string): Promise<Buffer>;
  /** Inventaire des objets (cle, taille, date de modif) pour la purge. */
  list(prefix?: string): Promise<StoredObjectInfo[]>;
  /** Supprime un objet. Idempotent : ne jette pas si la cle a deja disparu. */
  delete(key: string): Promise<void>;
}

/** Implementation par defaut tant que le stockage n'est pas configure (Phase 2). */
export class UnconfiguredObjectStorage implements ObjectStorage {
  private fail(): never {
    throw new Error('Stockage objet non configure : renseigner les variables S3_* (Phase 2).');
  }
  put(): Promise<{ key: string }> {
    return this.fail();
  }
  getSignedUrl(): Promise<string> {
    return this.fail();
  }
  exists(): Promise<boolean> {
    return this.fail();
  }
  get(): Promise<Buffer> {
    return this.fail();
  }
  list(): Promise<StoredObjectInfo[]> {
    return this.fail();
  }
  delete(): Promise<void> {
    return this.fail();
  }
}
