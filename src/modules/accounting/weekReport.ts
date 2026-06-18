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
