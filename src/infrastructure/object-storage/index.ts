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

export interface ObjectStorage {
  put(input: PutObjectInput): Promise<{ key: string }>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  exists(key: string): Promise<boolean>;
  /** Relit les octets d'un objet (ex. ré-attacher une image au menu). */
  get(key: string): Promise<Buffer>;
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
}
