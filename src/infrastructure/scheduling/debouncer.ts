import type { Debouncer, SerialQueue } from './index.js';

/**
 * Debounce en memoire (CDC §5.5) : coalesce les appels rapproches d'une meme
 * cle, n'executant que la derniere tache apres un court delai. Evite d'editer
 * plusieurs fois le meme message permanent en quelques secondes.
 */
export class SimpleDebouncer implements Debouncer {
  private readonly pending = new Map<
    string,
    { timer: NodeJS.Timeout; task: () => Promise<void> }
  >();

  constructor(private readonly delayMs: number) {}

  schedule(key: string, task: () => Promise<void>): void {
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      this.pending.delete(key);
      void task();
    }, this.delayMs);
    // Ne maintient pas le process en vie juste pour un rafraichissement.
    timer.unref?.();
    this.pending.set(key, { timer, task });
  }

  /** Execute immediatement toutes les taches en attente (arret gracieux). */
  async flush(): Promise<void> {
    const tasks = [...this.pending.values()];
    this.pending.clear();
    for (const { timer } of tasks) clearTimeout(timer);
    await Promise.all(tasks.map(({ task }) => task()));
  }
}

/**
 * File serie par cle (CDC §7.4 / §8.2) : garantit que les taches d'une meme cle
 * (ex. mise a jour des tableaux d'un serveur) s'executent une a une, jamais en
 * parallele.
 */
export class KeyedSerialQueue implements SerialQueue {
  private readonly chains = new Map<string, Promise<unknown>>();

  enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    // Chaine "amortie" : ne rejette jamais, pour garder la file vivante meme si
    // une tache echoue.
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    this.chains.set(key, settled);
    // Purge la cle une fois la chaine videe — SAUF si une nouvelle tache s'est
    // enfilee entre-temps (la cle pointe alors vers une autre chaine). Sans ce
    // nettoyage, une cle ephemere (ex. thread.id d'une vente) resterait a vie :
    // une entree de fuite par vente sur un process 24/7.
    void settled.then(() => {
      if (this.chains.get(key) === settled) this.chains.delete(key);
    });
    return next;
  }

  /**
   * Attend la fin de toutes les chaines en cours. A l'arret, on draine ainsi les
   * editions de tableaux deja enfilees (le debouncer ne couvre que celles encore
   * en attente, pas celles deja parties dans la file).
   */
  async idle(): Promise<void> {
    // Les chaines sont "amorties" (ne rejettent jamais) : Promise.all est sur.
    await Promise.all([...this.chains.values()]);
  }
}
