import { describe, expect, it } from 'vitest';
import {
  isClosureReminderWindow,
  localWeekdayHour,
} from '../src/modules/notifications/proactive.js';

describe('isClosureReminderWindow', () => {
  it('declenche le dimanche soir (20h-22h)', () => {
    expect(isClosureReminderWindow(6, 20)).toBe(true);
    expect(isClosureReminderWindow(6, 22)).toBe(true);
  });

  it('ne declenche pas avant 20h ni a partir de 23h', () => {
    expect(isClosureReminderWindow(6, 19)).toBe(false);
    expect(isClosureReminderWindow(6, 23)).toBe(false);
  });

  it('ne declenche pas les autres jours', () => {
    expect(isClosureReminderWindow(5, 21)).toBe(false);
    expect(isClosureReminderWindow(0, 21)).toBe(false);
  });
});

describe('localWeekdayHour', () => {
  it('convertit un instant UTC en jour/heure locaux (Europe/Paris)', () => {
    // Dimanche 15 juin 2026, 19:30 UTC = 21:30 a Paris (CEST, +2).
    const { weekday, hour } = localWeekdayHour(new Date('2026-06-14T19:30:00Z'), 'Europe/Paris');
    expect(weekday).toBe(6); // dimanche
    expect(hour).toBe(21);
  });
});
