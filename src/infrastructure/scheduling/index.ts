/**
 * Ordonnancement interne (CDC §5.5 & §8.2) — contrat.
 *
 * Deux besoins a venir :
 *  - DEBOUNCE des mises a jour de tableaux permanents (eviter d'editer
 *    plusieurs fois le meme message en quelques secondes / limites API) ;
 *  - QUEUE serialisant les traitements par vente et les editions de dashboards.
 *
 * L'implementation arrive avec les tableaux temps reel (Phase 4). On fixe ici le
 * contrat pour decoupler le metier du mecanisme.
 */

export interface Debouncer {
  /** Planifie `task` pour `key`, en repoussant les appels rapproches. */
  schedule(key: string, task: () => Promise<void>): void;
  /** Vide les taches en attente (arret gracieux). */
  flush(): Promise<void>;
}

export interface SerialQueue {
  /** Execute les taches d'une meme `key` strictement en serie. */
  enqueue<T>(key: string, task: () => Promise<T>): Promise<T>;
  /** Attend que toutes les chaines en cours soient videes (arret gracieux). */
  idle(): Promise<void>;
}
