import { describe, expect, it } from 'vitest';
import { SaleRisk } from '@prisma/client';
import { classifyRisk, FRAUD, riskBadge } from '../src/modules/sales/fraud.js';

describe('classifyRisk', () => {
  it('ne signale rien pour une vente normale', () => {
    const v = classifyRisk({ duplicateRefs: [], recentCount: 1, quantity: 200 });
    expect(v.level).toBe(SaleRisk.CLEAN);
    expect(v.reasons).toHaveLength(0);
  });

  it('marque FLAGGED si une preuve est recyclee (priorite max)', () => {
    const v = classifyRisk({
      duplicateRefs: ['HD-2026-0001'],
      recentCount: 5,
      quantity: 5000,
    });
    expect(v.level).toBe(SaleRisk.FLAGGED);
    expect(v.reasons[0]).toContain('HD-2026-0001');
    // les autres motifs sont quand meme listes
    expect(v.reasons.length).toBeGreaterThan(1);
  });

  it('marque SUSPECT au-dela du seuil de volume', () => {
    const v = classifyRisk({
      duplicateRefs: [],
      recentCount: 0,
      quantity: FRAUD.QUANTITY_THRESHOLD + 1,
    });
    expect(v.level).toBe(SaleRisk.SUSPECT);
  });

  it('ne marque pas SUSPECT pile au seuil de volume', () => {
    const v = classifyRisk({
      duplicateRefs: [],
      recentCount: 0,
      quantity: FRAUD.QUANTITY_THRESHOLD,
    });
    expect(v.level).toBe(SaleRisk.CLEAN);
  });

  it('marque SUSPECT en cas de rafale de declarations', () => {
    const v = classifyRisk({
      duplicateRefs: [],
      recentCount: FRAUD.BURST_COUNT,
      quantity: 100,
    });
    expect(v.level).toBe(SaleRisk.SUSPECT);
    expect(v.reasons[0]).toContain('Cadence');
  });

  it('expose un repere visuel par niveau', () => {
    expect(riskBadge(SaleRisk.CLEAN)).toBe('🟢');
    expect(riskBadge(SaleRisk.SUSPECT)).toBe('🟠');
    expect(riskBadge(SaleRisk.FLAGGED)).toBe('🔴');
  });
});
