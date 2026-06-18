import { ForumTagKey } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { mapForumTags } from '../src/modules/lockers/forumTags.js';

describe('mapForumTags', () => {
  it('mappe les noms reels du casier (avec accents) vers les cles internes', () => {
    const map = mapForumTags([
      { id: 't1', name: 'Nouvelle vente' },
      { id: 't2', name: 'À vérifier' },
      { id: 't3', name: 'À compléter' },
      { id: 't4', name: 'Validée' },
      { id: 't5', name: 'Payée' },
      { id: 't6', name: 'Refusée - recommandé' },
    ]);
    expect(map).toEqual({
      [ForumTagKey.NOUVELLE_VENTE]: 't1',
      [ForumTagKey.A_VERIFIER]: 't2',
      [ForumTagKey.A_COMPLETER]: 't3',
      [ForumTagKey.VALIDEE]: 't4',
      [ForumTagKey.PAYEE]: 't5',
      [ForumTagKey.REFUSEE]: 't6',
    });
  });

  it('laisse les cles non trouvees absentes', () => {
    const map = mapForumTags([{ id: 't1', name: 'Nouvelle vente' }]);
    expect(map[ForumTagKey.NOUVELLE_VENTE]).toBe('t1');
    expect(map[ForumTagKey.VALIDEE]).toBeUndefined();
  });
});
