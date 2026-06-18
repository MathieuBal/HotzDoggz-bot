import { describe, expect, it } from 'vitest';
import {
  computeWeekReport,
  personalView,
  type ValidatedSaleInput,
} from '../src/modules/accounting/weekReport.js';

const DIR = 'role-directeur';
const CODIR = 'role-codirecteur';

function sale(
  p: Partial<ValidatedSaleInput> & { employeeId: string; validatedQuantity: number },
): ValidatedSaleInput {
  return {
    nomRP: p.employeeId,
    salaryRate: 175,
    pnjUnitPrice: 210,
    gradeRoleId: 'role-chef',
    gradeLabel: "Chef d'equipe",
    ...p,
  };
}

describe('computeWeekReport', () => {
  it('agrege par employe et calcule CA/salaires/distribution', () => {
    const r = computeWeekReport(
      [
        sale({ employeeId: 'A', nomRP: 'Alice', validatedQuantity: 1980 }),
        sale({
          employeeId: 'B',
          nomRP: 'Bob',
          validatedQuantity: 1000,
          salaryRate: 155,
          gradeLabel: 'Novice',
        }),
      ],
      [DIR, CODIR],
    );
    expect(r.totalRevenue).toBe((1980 + 1000) * 210);
    expect(r.totalSalaries).toBe(1980 * 175 + 1000 * 155);
    // distribution coherente (somme = distribuable)
    expect(r.bonus + r.directorShare + r.coDirectorShare).toBe(r.distributable);
  });

  it('classe par quantite decroissante et designe le meilleur eligible', () => {
    const r = computeWeekReport(
      [
        sale({ employeeId: 'A', nomRP: 'Alice', validatedQuantity: 1000 }),
        sale({ employeeId: 'B', nomRP: 'Bob', validatedQuantity: 2000 }),
      ],
      [DIR, CODIR],
    );
    expect(r.employees[0]!.nomRP).toBe('Bob');
    expect(r.bestEmployee?.nomRP).toBe('Bob');
    expect(r.bestTie).toBe(false);
  });

  it('exclut la direction de la prime', () => {
    const r = computeWeekReport(
      [
        sale({
          employeeId: 'D',
          nomRP: 'Directeur',
          validatedQuantity: 5000,
          gradeRoleId: DIR,
          salaryRate: 185,
          gradeLabel: 'Direction',
        }),
        sale({ employeeId: 'A', nomRP: 'Alice', validatedQuantity: 1200 }),
      ],
      [DIR, CODIR],
    );
    // le directeur produit le plus mais n'est pas eligible
    expect(r.employees[0]!.nomRP).toBe('Directeur');
    expect(r.bestEmployee?.nomRP).toBe('Alice');
  });

  it('detecte une egalite au sommet du classement eligible', () => {
    const r = computeWeekReport(
      [
        sale({ employeeId: 'A', nomRP: 'Alice', validatedQuantity: 1500 }),
        sale({ employeeId: 'B', nomRP: 'Bob', validatedQuantity: 1500 }),
      ],
      [DIR, CODIR],
    );
    expect(r.bestTie).toBe(true);
  });

  it('vue perso : ecart au meilleur calcule hors direction', () => {
    const report = computeWeekReport(
      [
        sale({
          employeeId: 'D',
          nomRP: 'Patron',
          validatedQuantity: 9000,
          gradeRoleId: DIR,
          salaryRate: 185,
        }),
        sale({ employeeId: 'A', nomRP: 'Alice', validatedQuantity: 2000 }),
        sale({ employeeId: 'B', nomRP: 'Bob', validatedQuantity: 1200 }),
      ],
      [DIR, CODIR],
    );

    // Bob se compare a Alice (meilleur eligible), pas au patron (9000).
    const bob = personalView(report, 'B');
    expect(bob.best?.nomRP).toBe('Alice');
    expect(bob.gapToBest).toBe(800);
    expect(bob.rankAmongEligible).toBe(2);
    expect(bob.isLeader).toBe(false);

    // Alice est en tete des eligibles.
    const alice = personalView(report, 'A');
    expect(alice.isLeader).toBe(true);
    expect(alice.gapToBest).toBe(0);
    expect(alice.rankAmongEligible).toBe(1);

    // Le patron est hors prime.
    const patron = personalView(report, 'D');
    expect(patron.eligible).toBe(false);
    expect(patron.rankAmongEligible).toBeNull();
  });

  it('vue perso : employe sans vente cette semaine', () => {
    const report = computeWeekReport(
      [sale({ employeeId: 'A', nomRP: 'Alice', validatedQuantity: 1500 })],
      [DIR, CODIR],
    );
    const newbie = personalView(report, 'Z');
    expect(newbie.quantity).toBe(0);
    expect(newbie.gapToBest).toBe(1500);
    expect(newbie.isLeader).toBe(false);
  });

  it('additionne plusieurs ventes d’un meme employe (promotion mi-semaine)', () => {
    const r = computeWeekReport(
      [
        sale({
          employeeId: 'A',
          nomRP: 'Alice',
          validatedQuantity: 500,
          salaryRate: 155,
          gradeLabel: 'Novice',
        }),
        sale({
          employeeId: 'A',
          nomRP: 'Alice',
          validatedQuantity: 700,
          salaryRate: 175,
          gradeLabel: "Chef d'equipe",
        }),
      ],
      [DIR, CODIR],
    );
    expect(r.employees).toHaveLength(1);
    expect(r.employees[0]!.quantity).toBe(1200);
    expect(r.employees[0]!.salary).toBe(500 * 155 + 700 * 175);
    // libelle = grade le plus eleve atteint
    expect(r.employees[0]!.gradeLabel).toBe("Chef d'equipe");
  });
});
