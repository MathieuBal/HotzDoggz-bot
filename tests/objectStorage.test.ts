import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FilesystemObjectStorage,
  sha256,
} from '../src/infrastructure/object-storage/filesystem.js';

let dir: string;
let storage: FilesystemObjectStorage;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hotzdogz-storage-'));
  storage = new FilesystemObjectStorage(dir);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('FilesystemObjectStorage', () => {
  it('ecrit puis relit un objet a l’identique', async () => {
    const body = Buffer.from('preuve coffre plein');
    const key = 'guild/sale-1/coffre-plein.png';
    await storage.put({ key, body, contentType: 'image/png' });

    expect(await storage.exists(key)).toBe(true);
    expect(await storage.read(key)).toEqual(body);
    expect(await storage.exists('guild/sale-1/absent.png')).toBe(false);
  });

  it('refuse une cle qui sort du repertoire de base', async () => {
    await expect(
      storage.put({ key: '../evasion.txt', body: Buffer.from('x'), contentType: 'text/plain' }),
    ).rejects.toThrow();
  });

  it('produit une empreinte SHA-256 stable', () => {
    expect(sha256(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
