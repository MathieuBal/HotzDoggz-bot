import { describe, expect, it } from 'vitest';
import type { StaffCard } from '../src/modules/employees/staffService.js';
import { buildStaffCard } from '../src/discord/staff/staffCard.js';

/**
 * La carte de gestion (vue direction) doit refleter l'identite/grade/anomalies
 * et proposer les bonnes actions : Archiver pour un actif, Reactiver pour un
 * archive, et toujours porter l'employeeId en suffixe des customId des boutons.
 */
function card(over: Partial<StaffCard> = {}): StaffCard {
  return {
    employeeId: 'emp-1',
    discordUserId: '42',
    nomRP: 'Roger Herstal',
    active: true,
    multiplier: 1,
    since: new Date('2026-06-01T00:00:00Z'),
    casierForumId: null,
    onServer: true,
    displayName: 'roger',
    joinedServerAt: null,
    avatarUrl: null,
    gradeLabel: 'Stagiaire',
    gradeFromRoles: true,
    gradeRate: 145,
    ambiguous: false,
    missingGrade: false,
    matchedGrades: ['Stagiaire'],
    pnjSalesCount: 3,
    pnjUnits: 10192,
    pnjRevenue: 1477840,
    directSalesCount: 1,
    paidTotal: 50000,
    promotions: 0,
    lastPromotion: null,
    weekOpen: true,
    weekUnits: 500,
    weekRevenue: 105000,
    weekSalaryEstimate: 72500,
    badges: ['🌭 Première vente'],
    prestigeLabel: '🥉 Première fournée',
    ...over,
  };
}

function buttonIds(payload: ReturnType<typeof buildStaffCard>): string[] {
  const rows = (payload.components ?? []) as Array<{ toJSON(): unknown }>;
  const ids: string[] = [];
  for (const row of rows) {
    const json = row.toJSON() as { components?: Array<{ custom_id?: string }> };
    for (const c of json.components ?? []) if (c.custom_id) ids.push(c.custom_id);
  }
  return ids;
}

describe('buildStaffCard', () => {
  it('un employe actif propose Archiver (pas Reactiver)', () => {
    const ids = buttonIds(buildStaffCard(card({ active: true })));
    expect(ids).toContain('staff:archive:emp-1');
    expect(ids).not.toContain('staff:reactivate:emp-1');
  });

  it('un employe archive propose Reactiver (pas Archiver)', () => {
    const ids = buttonIds(buildStaffCard(card({ active: false })));
    expect(ids).toContain('staff:reactivate:emp-1');
    expect(ids).not.toContain('staff:archive:emp-1');
  });

  it('porte toujours les actions d edition avec employeeId en suffixe', () => {
    const ids = buttonIds(buildStaffCard(card()));
    expect(ids).toContain('staff:rename:emp-1');
    expect(ids).toContain('staff:grade:emp-1');
    expect(ids).toContain('staff:bracelet:emp-1');
    expect(ids).toContain('staff:resync:emp-1');
    expect(ids).toContain('staff:refresh:emp-1');
  });

  it('signale un grade ambigu et un grade manquant', () => {
    const ambiguous = buildStaffCard(card({ ambiguous: true, matchedGrades: ['Novice', 'Stagiaire'] }));
    const grade = ambiguous.embeds?.[0]?.toJSON().fields?.find((f) => f.name === 'Grade');
    expect(grade?.value).toContain('Plusieurs rôles de grade');

    const missing = buildStaffCard(card({ missingGrade: true, gradeLabel: null }));
    const grade2 = missing.embeds?.[0]?.toJSON().fields?.find((f) => f.name === 'Grade');
    expect(grade2?.value).toContain('Aucun rôle de grade');
  });

  it('affiche un avertissement de départ pour un employe ayant quitte le serveur', () => {
    const left = buildStaffCard(card({ onServer: false }));
    const statut = left.embeds?.[0]?.toJSON().fields?.find((f) => f.name === 'Statut');
    expect(statut?.value).toContain('a quitté le serveur');
  });
});
