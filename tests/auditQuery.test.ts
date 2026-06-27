import { describe, expect, it } from 'vitest';
import {
  actionLabel,
  buildAuditCsv,
  formatAuditLine,
  type AuditEntry,
} from '../src/modules/audit/auditQuery.js';

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  createdAt: new Date('2026-06-27T10:00:00.000Z'),
  action: 'SALE_VALIDATED',
  authorDiscordId: '123',
  entityType: 'Sale',
  entityId: 'sale-1',
  reason: 'RAS',
  correlationId: 'corr-1',
  ...over,
});

describe('actionLabel', () => {
  it('traduit les codes connus', () => {
    expect(actionLabel('SALE_VALIDATED')).toContain('validée');
    expect(actionLabel('PAYROLL_PAID')).toContain('Paie');
  });
  it('retombe sur le code brut si inconnu', () => {
    expect(actionLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });
});

describe('formatAuditLine', () => {
  it('rend un timestamp Discord, l’auteur mentionné et le motif', () => {
    const line = formatAuditLine(entry());
    expect(line).toContain('<t:'); // timestamp natif Discord
    expect(line).toContain('<@123>'); // mention auteur
    expect(line).toContain('RAS');
  });
  it('gère un auteur absent', () => {
    expect(formatAuditLine(entry({ authorDiscordId: null, reason: null }))).toContain('—');
  });
});

describe('buildAuditCsv', () => {
  it('écrit un en-tête + une ligne par entrée et échappe les guillemets', () => {
    const csv = buildAuditCsv([entry({ reason: 'dit "ok"' })]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('date_iso');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('""ok""'); // guillemets doublés (RFC 4180)
    expect(lines[1]).toContain('2026-06-27T10:00:00.000Z');
  });
});
