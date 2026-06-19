import { logger } from '../logging/logger.js';

/**
 * Minuterie periodique simple (CDC §8.5 : le bot est un processus permanent).
 * Execute une tache a intervalle regulier, en serie (jamais deux executions en
 * parallele meme si une tache deborde), et ne maintient pas le process en vie.
 */
export class Ticker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly intervalMs: number,
    private readonly task: () => Promise<void>,
    private readonly label: string,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return; // une execution precedente n'est pas terminee
    this.running = true;
    try {
      await this.task();
    } catch (err) {
      logger.error({ err, ticker: this.label }, 'Tache periodique en echec');
    } finally {
      this.running = false;
    }
  }
}
