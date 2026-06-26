/**
 * Fonctions de fenetre temporelle pour les notifications proactives (CDC §5.6).
 * Pures (sans I/O) : testables et importables sans tirer la connexion base.
 */

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/** Jour (0=lundi..6=dimanche) et heure locale dans un fuseau donne. */
export function localWeekdayHour(now: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  return { weekday: WEEKDAY_INDEX[wd] ?? 0, hour };
}

/** Fenetre de rappel de cloture (jour + plage horaire configurables). */
export interface ClosureReminderWindow {
  weekday: number; // 0=lundi..6=dimanche
  hourStart: number; // inclus
  hourEnd: number; // exclu
}

export const DEFAULT_CLOSURE_REMINDER_WINDOW: ClosureReminderWindow = {
  weekday: 6, // dimanche
  hourStart: 20,
  hourEnd: 23,
};

/**
 * Vrai si (weekday, hour) tombe dans la fenetre de rappel de cloture.
 * Par defaut : dimanche soir (20h-22h59 local).
 */
export function isClosureReminderWindow(
  weekday: number,
  hour: number,
  window: ClosureReminderWindow = DEFAULT_CLOSURE_REMINDER_WINDOW,
): boolean {
  return weekday === window.weekday && hour >= window.hourStart && hour < window.hourEnd;
}
