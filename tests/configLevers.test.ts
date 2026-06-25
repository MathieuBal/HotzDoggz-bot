import { describe, expect, it } from 'vitest';
import { computeReserve, distributeWeek } from '../src/modules/accounting/finance.js';
import { classifyRisk } from '../src/modules/sales/fraud.js';
import { expiryOf } from '../src/modules/stock/perishable.js';
import { isClosureReminderWindow } from '../src/modules/notifications/timeWindow.js';

/**
 * Verifie que les leviers economiques pilotables depuis le panel sont bien pris
 * en compte par les fonctions pures (et que les defauts restent les valeurs CDC).
 */

describe('finance : repartition pilotable', () => {
  it('applique des taux personnalises', () => {
    // Reserve 10 %, prime 50 %, directeur 30 % => co-dir = reste.
    const d = distributeWeek(200_000, 100_000, {
      reservePercent: 10,
      bonusPercent: 50,
      directorPercent: 30,
    });
    expect(d.reserve).toBe(20_000); // 10 % de 200 000
    expect(d.distributable).toBe(80_000); // 200000 - 100000 - 20000
    expect(d.bonus).toBe(40_000); // 50 %
    expect(d.directorShare).toBe(24_000); // 30 %
    expect(d.coDirectorShare).toBe(16_000); // reste (20 %)
    expect(d.bonus + d.directorShare + d.coDirectorShare).toBe(d.distributable);
  });

  it('garde les defauts CDC (5/35/40) sans taux fournis', () => {
    expect(computeReserve(210_000)).toBe(10_500);
    const d = distributeWeek(210_000, 155_000);
    expect(d.bonus).toBe(15_575);
    expect(d.directorShare).toBe(17_800);
  });
});

describe('anti-fraude : seuils pilotables', () => {
  it('signale un volume au-dessus du seuil personnalise', () => {
    const v = classifyRisk(
      { duplicateRefs: [], recentCount: 0, quantity: 60 },
      { quantityThreshold: 50, burstCount: 3, burstWindowMinutes: 10 },
    );
    expect(v.level).toBe('SUSPECT');
  });

  it('reste propre sous le seuil', () => {
    const v = classifyRisk(
      { duplicateRefs: [], recentCount: 0, quantity: 40 },
      { quantityThreshold: 50, burstCount: 3, burstWindowMinutes: 10 },
    );
    expect(v.level).toBe('CLEAN');
  });

  it('defaut 1000 conserve', () => {
    expect(classifyRisk({ duplicateRefs: [], recentCount: 0, quantity: 1001 }).level).toBe(
      'SUSPECT',
    );
    expect(classifyRisk({ duplicateRefs: [], recentCount: 0, quantity: 999 }).level).toBe('CLEAN');
  });
});

describe('peremption : duree pilotable', () => {
  it('applique une duree de vie personnalisee (en ms)', () => {
    const produced = new Date('2026-01-01T00:00:00.000Z');
    const oneDay = 24 * 3600 * 1000;
    expect(expiryOf(produced, oneDay).toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('defaut = 6 j 17 h', () => {
    const produced = new Date('2026-01-01T00:00:00.000Z');
    const expected = produced.getTime() + (6 * 24 + 17) * 3600 * 1000;
    expect(expiryOf(produced).getTime()).toBe(expected);
  });
});

describe('rappel de cloture : fenetre pilotable', () => {
  it('respecte une fenetre personnalisee (vendredi 18-20h)', () => {
    const win = { weekday: 4, hourStart: 18, hourEnd: 20 };
    expect(isClosureReminderWindow(4, 18, win)).toBe(true);
    expect(isClosureReminderWindow(4, 19, win)).toBe(true);
    expect(isClosureReminderWindow(4, 20, win)).toBe(false); // borne haute exclue
    expect(isClosureReminderWindow(5, 18, win)).toBe(false); // autre jour
  });

  it('defaut = dimanche 20-22h59', () => {
    expect(isClosureReminderWindow(6, 20)).toBe(true);
    expect(isClosureReminderWindow(6, 23)).toBe(false);
    expect(isClosureReminderWindow(5, 21)).toBe(false);
  });
});
