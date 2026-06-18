import { describe, expect, it } from 'vitest';
import { resolveGrade, type GradeRateRef } from '../src/modules/employees/grade.js';

const RATES: GradeRateRef[] = [
  { roleId: 'r_stagiaire', label: 'Stagiaire', ratePerUnit: 145 },
  { roleId: 'r_novice', label: 'Novice', ratePerUnit: 155 },
  { roleId: 'r_experimente', label: 'Experimente', ratePerUnit: 165 },
  { roleId: 'r_chef', label: "Chef d'equipe", ratePerUnit: 175 },
  { roleId: 'r_directeur', label: 'Directeur', ratePerUnit: 185 },
];

describe('resolveGrade', () => {
  it('retient le grade unique reconnu', () => {
    const r = resolveGrade(['r_chef', 'r_autre'], RATES);
    expect(r.selected?.roleId).toBe('r_chef');
    expect(r.ambiguous).toBe(false);
    expect(r.missing).toBe(false);
  });

  it('choisit le tarif le plus eleve et signale l’ambiguite', () => {
    const r = resolveGrade(['r_novice', 'r_chef'], RATES);
    expect(r.selected?.ratePerUnit).toBe(175);
    expect(r.ambiguous).toBe(true);
  });

  it('traite la direction comme grade le plus eleve (185 $)', () => {
    const r = resolveGrade(['r_chef', 'r_directeur'], RATES);
    expect(r.selected?.roleId).toBe('r_directeur');
    expect(r.selected?.ratePerUnit).toBe(185);
    expect(r.ambiguous).toBe(true);
  });

  it('signale l’absence de grade reconnu', () => {
    const r = resolveGrade(['r_inconnu'], RATES);
    expect(r.selected).toBeNull();
    expect(r.missing).toBe(true);
    expect(r.ambiguous).toBe(false);
  });
});
