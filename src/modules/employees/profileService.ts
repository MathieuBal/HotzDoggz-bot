import { SaleStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';

/**
 * Fiche employe 360 : agrege l'activite d'un employe (ventes, CA, salaires
 * verses, promotions) en une vue unique. Comble le manque pointe a l'audit
 * conceptuel : l'info employe etait eparpillee entre modules.
 */

export interface EmployeeProfile {
  nomRP: string;
  gradeLabel: string | null;
  active: boolean;
  multiplier: number; // bracelet
  since: Date;
  pnjSalesCount: number;
  pnjUnits: number;
  pnjRevenue: number;
  directSalesCount: number;
  paidTotal: number; // salaires cumules reellement verses
  promotions: number;
  lastPromotion: string | null;
}

// Statuts d'une vente "comptee" (validee et au-dela).
const COUNTED = [SaleStatus.VALIDEE, SaleStatus.INTEGREE_A_LA_PAIE, SaleStatus.PAYEE];

export async function getEmployeeProfile(
  guildConfigId: string,
  discordUserId: string,
): Promise<EmployeeProfile | null> {
  const employee = await prisma.employee.findUnique({ where: { discordUserId } });
  if (!employee || employee.guildConfigId !== guildConfigId) return null;

  const [pnjSales, directSalesCount, paid, promotions, lastPromo] = await Promise.all([
    prisma.sale.findMany({
      where: { employeeId: employee.id, status: { in: COUNTED } },
      select: { validatedQuantity: true, pnjUnitPriceSnapshot: true },
    }),
    prisma.directSale.count({ where: { employeeId: employee.id, status: { in: COUNTED } } }),
    prisma.payroll.aggregate({
      where: { employeeId: employee.id, status: 'PAID' },
      _sum: { totalAmount: true },
    }),
    // Vraies promotions : un grade precedent existait (fromRate non nul).
    prisma.employeeGradeEvent.count({
      where: { employeeId: employee.id, fromRate: { not: null } },
    }),
    prisma.employeeGradeEvent.findFirst({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
      select: { toLabel: true },
    }),
  ]);

  let pnjUnits = 0;
  let pnjRevenue = 0;
  for (const s of pnjSales) {
    const q = s.validatedQuantity ?? 0;
    pnjUnits += q;
    pnjRevenue += q * (s.pnjUnitPriceSnapshot ?? 0);
  }

  return {
    nomRP: employee.nomRP,
    gradeLabel: employee.lastGradeLabel,
    active: employee.status === 'ACTIVE',
    multiplier: employee.bonusMultiplier,
    since: employee.createdAt,
    pnjSalesCount: pnjSales.length,
    pnjUnits,
    pnjRevenue,
    directSalesCount,
    paidTotal: paid._sum.totalAmount ?? 0,
    promotions,
    lastPromotion: lastPromo?.toLabel ?? null,
  };
}
