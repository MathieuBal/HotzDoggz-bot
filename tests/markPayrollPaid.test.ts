import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SaleStatus } from '@prisma/client';

/**
 * Test d'integration (Prisma mocke) de markPayrollPaid. Verrouille notamment la
 * regression du bloquant 2 : a la paie, les ventes PNJ ET les ventes directes
 * integrees doivent passer a PAYEE.
 */
const { tx } = vi.hoisted(() => ({
  tx: {
    payroll: { findFirst: vi.fn(), updateMany: vi.fn() },
    ledgerEntry: { create: vi.fn() },
    sale: { updateMany: vi.fn() },
    directSale: { updateMany: vi.fn() },
  },
}));

vi.mock('../src/infrastructure/database/client.js', () => ({
  prisma: { $transaction: (cb: (t: typeof tx) => unknown) => cb(tx) },
  disconnectPrisma: vi.fn(),
}));
vi.mock('../src/modules/audit/auditService.js', () => ({ writeAudit: vi.fn() }));

import { markPayrollPaid } from '../src/modules/payroll/payrollService.js';

beforeEach(() => {
  vi.clearAllMocks();
  tx.payroll.updateMany.mockResolvedValue({ count: 1 });
  tx.ledgerEntry.create.mockResolvedValue({});
  tx.sale.updateMany.mockResolvedValue({ count: 0 });
  tx.directSale.updateMany.mockResolvedValue({ count: 0 });
});

describe('markPayrollPaid', () => {
  it('verse le net (total - acompte) et solde ventes PNJ ET directes', async () => {
    tx.payroll.findFirst.mockResolvedValue({
      id: 'p1',
      weekId: 'w1',
      totalAmount: 1000,
      advancedAmount: 200,
      employee: { nomRP: 'Alice' },
    });

    const res = await markPayrollPaid('g1', 'e1', 'payer1', 'corr');

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.totalAmount).toBe(800); // net = 1000 - 200

    // Regression bloquant 2 : les DEUX types de ventes passent a PAYEE.
    const expected = {
      where: { weekId: 'w1', employeeId: 'e1', status: SaleStatus.INTEGREE_A_LA_PAIE },
      data: { status: SaleStatus.PAYEE },
    };
    expect(tx.sale.updateMany).toHaveBeenCalledWith(expected);
    expect(tx.directSale.updateMany).toHaveBeenCalledWith(expected);
  });

  it('echoue (et ne touche a rien) si aucune paie en attente', async () => {
    tx.payroll.findFirst.mockResolvedValue(null);
    const res = await markPayrollPaid('g1', 'e1', 'payer1', 'corr');
    expect(res.ok).toBe(false);
    expect(tx.directSale.updateMany).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('refuse une double paie via le verrou optimiste (count !== 1)', async () => {
    tx.payroll.findFirst.mockResolvedValue({
      id: 'p1',
      weekId: 'w1',
      totalAmount: 1000,
      advancedAmount: 0,
      employee: { nomRP: 'Bob' },
    });
    tx.payroll.updateMany.mockResolvedValue({ count: 0 }); // gagne par une autre tx

    const res = await markPayrollPaid('g1', 'e1', 'payer1', 'corr');
    expect(res.ok).toBe(false);
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });
});
