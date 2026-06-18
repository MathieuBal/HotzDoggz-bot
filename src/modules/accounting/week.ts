/**
 * Bornes de la semaine comptable (CDC §14 : Europe/Paris, lundi 00:00 a
 * dimanche 23:59 par defaut). Fonctions PURES, sans dependance a une lib de
 * dates : on s'appuie sur Intl pour gerer le fuseau (et le DST).
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

/** Decalage (ms) dont le fuseau est en avance sur UTC a un instant donne. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(
    dtf
      .formatToParts(instant)
      .filter((x) => x.type !== 'literal')
      .map((x) => [x.type, x.value]),
  );
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUTC - instant.getTime();
}

/** Convertit une heure murale (locale au fuseau) en instant UTC. */
function zonedWallToUtc(y: number, monthIndex: number, d: number, timeZone: string): Date {
  const guess = Date.UTC(y, monthIndex, d, 0, 0, 0);
  const offset1 = tzOffsetMs(new Date(guess), timeZone);
  let utc = guess - offset1;
  const offset2 = tzOffsetMs(new Date(utc), timeZone);
  if (offset2 !== offset1) utc = guess - offset2;
  return new Date(utc);
}

export interface WeekBounds {
  startAt: Date; // lundi 00:00 (local)
  endAt: Date; // dimanche 23:59:59.999 (local)
}

/** Bornes de la semaine ISO (lundi -> dimanche) contenant `now`, dans `timeZone`. */
export function computeIsoWeekBounds(now: Date, timeZone: string): WeekBounds {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = Object.fromEntries(
    dtf
      .formatToParts(now)
      .filter((x) => x.type !== 'literal')
      .map((x) => [x.type, x.value]),
  );
  const dow = WEEKDAY_INDEX[p.weekday as string] ?? 0;

  // Date locale de ce jour, puis recul jusqu'au lundi.
  const todayMidnightUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const monday = new Date(todayMidnightUtc - dow * 86_400_000);
  const my = monday.getUTCFullYear();
  const mm = monday.getUTCMonth();
  const md = monday.getUTCDate();

  const startAt = zonedWallToUtc(my, mm, md, timeZone);
  const nextMonday = zonedWallToUtc(my, mm, md + 7, timeZone);
  const endAt = new Date(nextMonday.getTime() - 1);
  return { startAt, endAt };
}
