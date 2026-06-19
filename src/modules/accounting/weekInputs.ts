import {
  ClientOrderStatus,
  OrderContributionStatus,
  type Prisma,
  type PrismaClient,
  SaleStatus,
} from '@prisma/client';
import type { ValidatedSaleInput } from './weekReport.js';

type Db = PrismaClient | Prisma.TransactionClient;

export interface WeekReportInputs {
  lines: ValidatedSaleInput[];
  extraRevenue: number; // CA des commandes client payees, hors PNJ
}

/**
 * Rassemble TOUTES les entrees du rapport hebdomadaire pour une semaine :
 *  - ventes PNJ validees (revenu = qte * prix PNJ) ;
 *  - contributions aux commandes client PAYEES de la semaine (revenu porte a
 *    part via `extraRevenue` ; les lignes n'apportent que du salaire).
 *
 * Point unique de verite : le tableau live (getOpenWeekSnapshot) et la cloture
 * (closeWeek) consomment la meme source, donc ne divergent jamais.
 */
export async function collectWeekReportInputs(db: Db, weekId: string): Promise<WeekReportInputs> {
  const sales = await db.sale.findMany({
    where: { weekId, status: SaleStatus.VALIDEE },
    select: {
      employeeId: true,
      validatedQuantity: true,
      salaryRateSnapshot: true,
      pnjUnitPriceSnapshot: true,
      gradeRoleIdSnapshot: true,
      gradeSnapshot: true,
      employee: { select: { nomRP: true } },
    },
  });
  const saleLines: ValidatedSaleInput[] = sales.map((s) => ({
    employeeId: s.employeeId,
    nomRP: s.employee.nomRP,
    validatedQuantity: s.validatedQuantity ?? 0,
    salaryRate: s.salaryRateSnapshot ?? 0,
    pnjUnitPrice: s.pnjUnitPriceSnapshot ?? 0,
    gradeRoleId: s.gradeRoleIdSnapshot,
    gradeLabel: s.gradeSnapshot,
  }));

  const orders = await db.clientOrder.findMany({
    where: { weekId, status: ClientOrderStatus.PAYEE },
    select: {
      negotiatedPrice: true,
      contributions: {
        where: { status: OrderContributionStatus.ACTIVE },
        select: {
          employeeId: true,
          quantity: true,
          salaryRateSnapshot: true,
          gradeRoleIdSnapshot: true,
          gradeSnapshot: true,
          employee: { select: { nomRP: true } },
        },
      },
    },
  });

  let extraRevenue = 0;
  const orderLines: ValidatedSaleInput[] = [];
  for (const order of orders) {
    extraRevenue += order.negotiatedPrice;
    for (const c of order.contributions) {
      orderLines.push({
        employeeId: c.employeeId,
        nomRP: c.employee.nomRP,
        validatedQuantity: c.quantity,
        salaryRate: c.salaryRateSnapshot ?? 0,
        pnjUnitPrice: 0, // revenu porte par extraRevenue, pas par la ligne
        gradeRoleId: c.gradeRoleIdSnapshot,
        gradeLabel: c.gradeSnapshot,
      });
    }
  }

  return { lines: [...saleLines, ...orderLines], extraRevenue };
}
