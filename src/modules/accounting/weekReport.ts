import { distributeWeek, type ProfitDistribution } from './finance.js';

/**
 * Construction du rapport comptable hebdomadaire (CDC §6) a partir des ventes
 * VALIDEES (source de verite, §6.1). Fonction PURE => testable.
 *
 * Le classement et la prime n'utilisent que les quantites validees de la
 * semaine ouverte ; Directeur et Co-directeur sont exclus de la prime (§6.5).
 */

export interface ValidatedSaleInput {
  employeeId: string;
  nomRP: string;
  validatedQuantity: number;
  salaryRate: number;
  pnjUnitPrice: number;
  gradeRoleId: string | null;
  gradeLabel: string | null;
}

export interface EmployeeLine {
  employeeId: string;
  nomRP: string;
  gradeLabel: string | null;
  quantity: number;
  revenue: number;
  salary: number;
  eligible: boolean; // eligible a la prime (hors direction)
}

export interface WeekReport extends ProfitDistribution {
  employees: EmployeeLine[]; // tries par quantite decroissante
  bestEmployee: { employeeId: string; nomRP: string; quantity: number } | null;
  bestTie: boolean; // egalite au sommet du classement eligible (§6.5)
  pendingNote?: string;
}

export function computeWeekReport(
  sales: readonly ValidatedSaleInput[],
  directionRoleIds: readonly string[],
): WeekReport {
  const directionRoles = new Set(directionRoleIds.filter(Boolean));

  const byEmployee = new Map<string, EmployeeLine & { topRate: number; isDirection: boolean }>();
  for (const sale of sales) {
    const revenue = sale.validatedQuantity * sale.pnjUnitPrice;
    const salary = sale.validatedQuantity * sale.salaryRate;
    const saleIsDirection = sale.gradeRoleId !== null && directionRoles.has(sale.gradeRoleId);

    const current = byEmployee.get(sale.employeeId);
    if (!current) {
      byEmployee.set(sale.employeeId, {
        employeeId: sale.employeeId,
        nomRP: sale.nomRP,
        gradeLabel: sale.gradeLabel,
        quantity: sale.validatedQuantity,
        revenue,
        salary,
        eligible: !saleIsDirection,
        topRate: sale.salaryRate,
        isDirection: saleIsDirection,
      });
    } else {
      current.quantity += sale.validatedQuantity;
      current.revenue += revenue;
      current.salary += salary;
      current.isDirection = current.isDirection || saleIsDirection;
      current.eligible = !current.isDirection;
      // libelle = grade le plus eleve atteint dans la semaine
      if (sale.salaryRate > current.topRate) {
        current.topRate = sale.salaryRate;
        current.gradeLabel = sale.gradeLabel;
      }
    }
  }

  const employees: EmployeeLine[] = [...byEmployee.values()]
    .map(({ topRate: _topRate, isDirection: _isDirection, ...line }) => line)
    .sort((a, b) => b.quantity - a.quantity || a.nomRP.localeCompare(b.nomRP));

  const totalRevenue = employees.reduce((s, e) => s + e.revenue, 0);
  const totalSalaries = employees.reduce((s, e) => s + e.salary, 0);
  const distribution = distributeWeek(totalRevenue, totalSalaries);

  // Meilleur employe eligible (quantite validee la plus elevee).
  const eligible = employees.filter((e) => e.eligible && e.quantity > 0);
  const maxQuantity = eligible.length > 0 ? Math.max(...eligible.map((e) => e.quantity)) : 0;
  const top = eligible.filter((e) => e.quantity === maxQuantity);
  const bestEmployee =
    top.length > 0
      ? { employeeId: top[0]!.employeeId, nomRP: top[0]!.nomRP, quantity: top[0]!.quantity }
      : null;

  return {
    ...distribution,
    employees,
    bestEmployee,
    bestTie: top.length > 1,
  };
}

export interface PersonalView {
  quantity: number;
  salary: number;
  eligible: boolean;
  /** Rang dans la course a la prime (employes eligibles uniquement), ou null si direction. */
  rankAmongEligible: number | null;
  /** Meilleur employe eligible (hors direction/co-patron). */
  best: { nomRP: string; quantity: number } | null;
  /** Unites manquantes pour egaler le meilleur (0 si en tete). */
  gapToBest: number;
  isLeader: boolean;
  tieAtTop: boolean;
}

/**
 * Vue personnelle d'un employe (CDC §7.4 : suivi individuel). L'ecart est mesure
 * vis-a-vis du meilleur employe ELIGIBLE — la direction et le co-patron sont
 * exclus de la reference, pour motiver sans fausser la comparaison.
 */
export function personalView(report: WeekReport, employeeId: string): PersonalView {
  const line = report.employees.find((e) => e.employeeId === employeeId);
  const quantity = line?.quantity ?? 0;
  const salary = line?.salary ?? 0;
  const eligible = line?.eligible ?? true;

  const rankAmongEligible = eligible
    ? report.employees.filter((e) => e.eligible && e.quantity > quantity).length + 1
    : null;

  const best = report.bestEmployee
    ? { nomRP: report.bestEmployee.nomRP, quantity: report.bestEmployee.quantity }
    : null;

  const gapToBest = best ? Math.max(0, best.quantity - quantity) : 0;
  const isLeader = eligible && best !== null && quantity > 0 && quantity >= best.quantity;

  return {
    quantity,
    salary,
    eligible,
    rankAmongEligible,
    best,
    gapToBest,
    isLeader,
    tieAtTop: isLeader && report.bestTie,
  };
}
