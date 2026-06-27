import { describe, expect, it } from 'vitest';
import type { PayrollLine } from '../src/modules/payroll/payrollService.js';
import { buildPayPickComponents } from '../src/discord/payroll/payrollBoard.js';

/**
 * Le menu « Marquer payee » du tableau de paie ne doit lister que les paies
 * encore dues, libellees avec le NET a verser (total - acompte), valeur =
 * employeeId (consommee par markPayrollPaid), et respecter le plafond Discord.
 */
function line(over: Partial<PayrollLine> & { employeeId: string; nomRP: string }): PayrollLine {
  const { nomRP, ...rest } = over;
  return {
    status: 'PENDING',
    totalAmount: 1000,
    advancedAmount: 0,
    bonusAmount: 0,
    employee: { nomRP, discordUserId: 'd' },
    ...rest,
  } as unknown as PayrollLine;
}

// Extrait les options du premier (unique) menu produit.
function options(rows: ReturnType<typeof buildPayPickComponents>): { label: string; value: string }[] {
  const json = rows[0]?.toJSON();
  const menu = json?.components?.[0] as { options?: { label: string; value: string }[] } | undefined;
  return menu?.options ?? [];
}

describe('buildPayPickComponents', () => {
  it('ne propose que les paies en attente', () => {
    const rows = buildPayPickComponents([
      line({ employeeId: 'e1', nomRP: 'Alice', status: 'PENDING' }),
      line({ employeeId: 'e2', nomRP: 'Bob', status: 'PAID' }),
    ]);
    const opts = options(rows);
    expect(opts).toHaveLength(1);
    expect(opts[0]?.value).toBe('e1');
    expect(opts[0]?.label).toContain('Alice');
  });

  it('libelle avec le net a verser (total moins acompte)', () => {
    const rows = buildPayPickComponents([
      line({ employeeId: 'e1', nomRP: 'Alice', totalAmount: 1000, advancedAmount: 300 }),
    ]);
    expect(options(rows)[0]?.label).toContain('700');
  });

  it('ne rend aucun composant quand tout est paye', () => {
    const rows = buildPayPickComponents([
      line({ employeeId: 'e1', nomRP: 'Alice', status: 'PAID' }),
    ]);
    expect(rows).toHaveLength(0);
  });

  it('plafonne a 25 options (limite Discord)', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      line({ employeeId: `e${i}`, nomRP: `Emp${i}` }),
    );
    expect(options(buildPayPickComponents(many))).toHaveLength(25);
  });
});
