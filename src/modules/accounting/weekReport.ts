import {
  DEFAULT_DISTRIBUTION_RATES,
  distributeWeek,
  type DistributionRates,
  type ProfitDistribution,
} from './finance.js';

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
  /** Multiplicateur "bracelet" (x2/x3 achete en vrai argent). Defaut 1. */
  multiplier?: number;
}

export interface EmployeeLine {
  employeeId: string;
  nomRP: string;
  gradeLabel: string | null;
  quantity: number; // production reelle declaree (sert au salaire & au CA)
  revenue: number;
  salary: number;
  eligible: boolean; // eligible a la prime (hors direction)
  multiplier: number; // bracelet (1 = aucun)
  adjustedQuantity: number; // quantite / multiplier : effort equitable pour la prime
}

export interface WeekReport extends ProfitDistribution {
  employees: EmployeeLine[]; // tries par production AJUSTEE decroissante
  bestEmployee: {
    employeeId: string;
    nomRP: string;
    quantity: number;
    adjustedQuantity: number;
  } | null;
  bestTie: boolean; // egalite au sommet du classement ajuste eligible (§6.5)
  pendingNote?: string;
}

export function computeWeekReport(
  sales: readonly ValidatedSaleInput[],
  directionRoleIds: readonly string[],
  extraRevenue = 0,
  rates: DistributionRates = DEFAULT_DISTRIBUTION_RATES,
): WeekReport {
  const directionRoles = new Set(directionRoleIds.filter(Boolean));

  const byEmployee = new Map<
    string,
    Omit<EmployeeLine, 'adjustedQuantity'> & { topRate: number; isDirection: boolean }
  >();
  for (const sale of sales) {
    const revenue = sale.validatedQuantity * sale.pnjUnitPrice;
    const salary = sale.validatedQuantity * sale.salaryRate;
    const saleIsDirection = sale.gradeRoleId !== null && directionRoles.has(sale.gradeRoleId);
    const multiplier = sale.multiplier && sale.multiplier > 0 ? sale.multiplier : 1;

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
        multiplier,
        topRate: sale.salaryRate,
        isDirection: saleIsDirection,
      });
    } else {
      current.quantity += sale.validatedQuantity;
      current.revenue += revenue;
      current.salary += salary;
      current.isDirection = current.isDirection || saleIsDirection;
      current.eligible = !current.isDirection;
      current.multiplier = Math.max(current.multiplier, multiplier);
      // libelle = grade le plus eleve atteint dans la semaine
      if (sale.salaryRate > current.topRate) {
        current.topRate = sale.salaryRate;
        current.gradeLabel = sale.gradeLabel;
      }
    }
  }

  const employees: EmployeeLine[] = [...byEmployee.values()]
    .map(({ topRate: _topRate, isDirection: _isDirection, ...line }) => ({
      ...line,
      adjustedQuantity: line.quantity / line.multiplier,
    }))
    .sort((a, b) => b.adjustedQuantity - a.adjustedQuantity || a.nomRP.localeCompare(b.nomRP));

  // `extraRevenue` : CA des commandes client payees (prix negocie, hors PNJ).
  // Les contributions a ces commandes arrivent dans `sales` avec pnjUnitPrice=0,
  // donc elles n'ajoutent que du salaire ; leur revenu est porte ici, une fois.
  const totalRevenue = employees.reduce((s, e) => s + e.revenue, 0) + extraRevenue;
  const totalSalaries = employees.reduce((s, e) => s + e.salary, 0);
  const distribution = distributeWeek(totalRevenue, totalSalaries, rates);

  // Meilleur employe eligible : production AJUSTEE la plus elevee (bracelet neutralise).
  const eligible = employees.filter((e) => e.eligible && e.adjustedQuantity > 0);
  const maxAdjusted =
    eligible.length > 0 ? Math.max(...eligible.map((e) => e.adjustedQuantity)) : 0;
  const top = eligible.filter((e) => e.adjustedQuantity === maxAdjusted);
  const bestEmployee =
    top.length > 0
      ? {
          employeeId: top[0]!.employeeId,
          nomRP: top[0]!.nomRP,
          quantity: top[0]!.quantity,
          adjustedQuantity: top[0]!.adjustedQuantity,
        }
      : null;

  return {
    ...distribution,
    employees,
    bestEmployee,
    bestTie: top.length > 1,
  };
}

/**
 * Repartition de la prime a la cloture, PROPORTIONNELLE a l'effort produit
 * (production ajustee, bracelet neutralise). Des qu'on produit, on touche une
 * part ; seuls ceux qui n'ont rien fait touchent 0. Naturellement degressif
 * (plus tu produis, plus ta part est grosse). Methode du plus grand reste pour
 * que la somme = prime exactement.
 *
 * @returns Map employeeId -> montant de prime (entier).
 */
export function computeBonusShares(report: WeekReport): Map<string, number> {
  const shares = new Map<string, number>();
  if (report.bonus <= 0) return shares;

  const eligible = report.employees
    .filter((e) => e.eligible && e.adjustedQuantity > 0)
    .sort((a, b) => b.adjustedQuantity - a.adjustedQuantity || a.nomRP.localeCompare(b.nomRP));
  const totalAdj = eligible.reduce((s, e) => s + e.adjustedQuantity, 0);
  if (eligible.length === 0 || totalAdj <= 0) return shares;

  const parts = eligible.map((e) => {
    const exact = (report.bonus * e.adjustedQuantity) / totalAdj;
    const amt = Math.floor(exact);
    return { id: e.employeeId, amt, rem: exact - amt };
  });
  let residual = report.bonus - parts.reduce((s, p) => s + p.amt, 0);
  // Residu aux plus grands restes (ordre stable : plus gros producteurs d'abord).
  const byRemainder = [...parts].sort((a, b) => b.rem - a.rem);
  for (let i = 0; i < byRemainder.length && residual > 0; i++) {
    byRemainder[i]!.amt += 1;
    residual--;
  }
  for (const p of parts) if (p.amt > 0) shares.set(p.id, p.amt);
  return shares;
}

export interface PersonalView {
  quantity: number;
  salary: number;
  eligible: boolean;
  multiplier: number;
  adjustedQuantity: number;
  /** Rang dans la course a la prime (classement ajuste), ou null si direction. */
  rankAmongEligible: number | null;
  /** Meilleur employe eligible (hors direction/co-patron). */
  best: { nomRP: string; adjustedQuantity: number } | null;
  /** Effort ajuste manquant pour egaler le meilleur (0 si en tete). */
  gapToBest: number;
  isLeader: boolean;
  tieAtTop: boolean;
}

/**
 * Vue personnelle d'un employe (CDC §7.4 : suivi individuel). La course a la
 * prime se mesure sur la production AJUSTEE (bracelet neutralise) ; direction et
 * co-patron sont exclus de la reference.
 */
export function personalView(report: WeekReport, employeeId: string): PersonalView {
  const line = report.employees.find((e) => e.employeeId === employeeId);
  const quantity = line?.quantity ?? 0;
  const salary = line?.salary ?? 0;
  const eligible = line?.eligible ?? true;
  const multiplier = line?.multiplier ?? 1;
  const adjustedQuantity = line?.adjustedQuantity ?? 0;

  const rankAmongEligible = eligible
    ? report.employees.filter((e) => e.eligible && e.adjustedQuantity > adjustedQuantity).length + 1
    : null;

  const best = report.bestEmployee
    ? { nomRP: report.bestEmployee.nomRP, adjustedQuantity: report.bestEmployee.adjustedQuantity }
    : null;

  const gapToBest = best ? Math.max(0, best.adjustedQuantity - adjustedQuantity) : 0;
  const isLeader =
    eligible && best !== null && adjustedQuantity > 0 && adjustedQuantity >= best.adjustedQuantity;

  return {
    quantity,
    salary,
    eligible,
    multiplier,
    adjustedQuantity,
    rankAmongEligible,
    best,
    gapToBest,
    isLeader,
    tieAtTop: isLeader && report.bestTie,
  };
}
