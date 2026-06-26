import { describe, expect, it, vi } from 'vitest';
import type { ThreadChannel } from 'discord.js';
import { archiveFiche } from '../src/discord/verification/ficheHelpers.js';

/**
 * archiveFiche range la fiche d'une vente validee hors du forum actif. C'est un
 * effet best-effort : il ne doit jamais lever (l'action de direction est deja
 * committee en base) et ne doit rien faire si le thread est deja archive.
 */
function fakeThread(over: Partial<ThreadChannel> = {}): {
  thread: ThreadChannel;
  setArchived: ReturnType<typeof vi.fn>;
} {
  const setArchived = vi.fn().mockResolvedValue(undefined);
  const thread = { archived: false, setArchived, ...over } as unknown as ThreadChannel;
  return { thread, setArchived };
}

describe('archiveFiche', () => {
  it('archive un thread actif', async () => {
    const { thread, setArchived } = fakeThread();
    await archiveFiche(thread, 'sale-1');
    expect(setArchived).toHaveBeenCalledOnce();
    expect(setArchived).toHaveBeenCalledWith(true, expect.any(String));
  });

  it('ne fait rien si le thread est deja archive', async () => {
    const { thread, setArchived } = fakeThread({ archived: true } as Partial<ThreadChannel>);
    await archiveFiche(thread, 'sale-1');
    expect(setArchived).not.toHaveBeenCalled();
  });

  it('avale une erreur Discord sans lever (best-effort)', async () => {
    const setArchived = vi.fn().mockRejectedValue(new Error('Missing Access'));
    const thread = { archived: false, setArchived } as unknown as ThreadChannel;
    await expect(archiveFiche(thread, 'sale-1')).resolves.toBeUndefined();
    expect(setArchived).toHaveBeenCalledOnce();
  });
});
