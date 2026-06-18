import { ForumTagKey } from '@prisma/client';

/**
 * Cartographie des tags d'un Forum casier (CDC §2.4 / §5.1).
 *
 * Les tags Discord sont propres a chaque Forum (IDs distincts meme a noms
 * identiques). On mappe les tags disponibles d'un casier vers nos cles internes
 * a partir de leur nom, pour pouvoir ensuite appliquer le bon tag par son ID.
 *
 * Fonction PURE et tolerante aux accents/casse.
 */

export interface RawForumTag {
  id: string;
  name: string;
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

const MATCHERS: Array<{ key: ForumTagKey; test: (n: string) => boolean }> = [
  { key: ForumTagKey.NOUVELLE_VENTE, test: (n) => n.includes('nouvelle') },
  { key: ForumTagKey.A_VERIFIER, test: (n) => n.includes('verifier') },
  { key: ForumTagKey.A_COMPLETER, test: (n) => n.includes('completer') },
  { key: ForumTagKey.REFUSEE, test: (n) => n.startsWith('refus') },
  { key: ForumTagKey.VALIDEE, test: (n) => n.includes('valid') },
  { key: ForumTagKey.PAYEE, test: (n) => n.includes('paye') },
];

/**
 * @returns une table cle interne -> ID de tag Discord (cles absentes si non trouvees).
 */
export function mapForumTags(tags: readonly RawForumTag[]): Partial<Record<ForumTagKey, string>> {
  const result: Partial<Record<ForumTagKey, string>> = {};
  for (const tag of tags) {
    const norm = normalize(tag.name);
    for (const { key, test } of MATCHERS) {
      if (result[key] === undefined && test(norm)) {
        result[key] = tag.id;
        break;
      }
    }
  }
  return result;
}
