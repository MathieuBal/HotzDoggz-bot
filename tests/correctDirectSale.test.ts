import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Test d'integration (Prisma mocke) de correctDirectSale : verrouille que la
 * correction ecrit des ajustements SIGNES (negatifs si la quantite baisse) au
 * journal — CA et salaire — comme correctSale (PNJ).
 */
const { tx } = vi.hoisted(() => ({
  tx: {
    directSale: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    directSaleLine: { update: vi.fn() },
    ledgerEntry: { create: vi.fn() },
  },
}));

vi.mock('../src/infrastructure/database/client.js', () => ({
  prisma: { $transaction: (cb: (t: typeof tx) => unknown) => cb(tx) },
  disconnectPrisma: vi.fn(),
}));
vi.mock('../src/modules/audit/auditService.js', () => ({ writeAudit: vi.fn() }));

import { correctDirectSale } from '../src/modules/directSales/directSaleService.js';

beforeEach(() => {
  vi.clearAllMocks();
  tx.directSaleLine.update.mockResolvedValue({});
  tx.ledgerEntry.create.mockResolvedValue({});
  tx.directSale.findUniqueOrThrow.mockResolvedValue({
    id: 'ds1',
    reference: 'VD-2026-0001',
    threadId: 't',
    controlThreadId: 'c',
    employee: { discordUserId: 'd', casierForumId: 'f' },
  });
});

function saleWith(validatedQuantity: number) {
  return {
    id: 'ds1',
    reference: 'VD-2026-0001',
    status: 'VALIDEE',
    weekId: 'w1',
    salaryRateSnapshot: 150,
    week: { status: 'OPEN' },
    employeeId: 'e1',
    guildConfigId: 'g1',
    lines: [
      { id: 'l1', unitPrice: 210, declaredQuantity: validatedQuantity, validatedQuantity },
    ],
  };
}

describe('correctDirectSale', () => {
  it('écrit des ajustements NÉGATIFS sur une correction à la baisse', async () => {
    tx.directSale.findUnique.mockResolvedValue(saleWith(10)); // validé à 10
    const res = await correctDirectSale({
      saleId: 'ds1',
      actorId: 'a',
      lineQuantities: [{ lineId: 'l1', newQuantity: 7 }], // baisse 10 -> 7
      reason: 'erreur',
      correlationId: 'corr',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.oldQuantity).toBe(10);
      expect(res.data.newQuantity).toBe(7);
      expect(res.data.revenueDelta).toBe(-3 * 210); // signé négatif
    }
    const amounts = tx.ledgerEntry.create.mock.calls.map((c) => c[0].data.amount);
    expect(amounts).toContain(-3 * 210); // ajustement CA
    expect(amounts).toContain(-3 * 150); // ajustement salaire
  });

  it('refuse si la vente n’est pas VALIDEE', async () => {
    tx.directSale.findUnique.mockResolvedValue({ ...saleWith(10), status: 'SOUMISE' });
    const res = await correctDirectSale({
      saleId: 'ds1',
      actorId: 'a',
      lineQuantities: [{ lineId: 'l1', newQuantity: 7 }],
      reason: 'x',
      correlationId: 'c',
    });
    expect(res.ok).toBe(false);
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });
});
