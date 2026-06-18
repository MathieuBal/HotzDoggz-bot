import { prisma } from '../../infrastructure/database/client.js';

export interface ExportFile {
  name: string;
  content: string;
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(';');
}

function iso(d: Date | null): string {
  return d ? d.toISOString() : '';
}

/**
 * Genere les exports CSV de la derniere semaine cloturee (CDC §5.8 / §10.4) :
 * un fichier ventes et un fichier paies. Retourne null si aucune semaine cloturee.
 */
export async function buildLatestWeekExport(guildConfigId: string): Promise<{
  weekLabel: string;
  files: ExportFile[];
} | null> {
  const week = await prisma.accountingWeek.findFirst({
    where: { guildConfigId, status: 'CLOSED' },
    orderBy: { endAt: 'desc' },
  });
  if (!week) return null;

  const sales = await prisma.sale.findMany({
    where: { weekId: week.id },
    include: { employee: { select: { nomRP: true } } },
    orderBy: { reference: 'asc' },
  });
  const payrolls = await prisma.payroll.findMany({
    where: { weekId: week.id },
    include: { employee: { select: { nomRP: true } } },
    orderBy: { totalAmount: 'desc' },
  });

  const salesCsv = [
    csvRow([
      'reference',
      'employe',
      'statut',
      'quantite_declaree',
      'quantite_validee',
      'tarif',
      'prix_pnj',
      'ca',
      'salaire',
      'validee_le',
    ]),
    ...sales.map((s) => {
      const vq = s.validatedQuantity ?? 0;
      const rate = s.salaryRateSnapshot ?? 0;
      const pnj = s.pnjUnitPriceSnapshot ?? 0;
      return csvRow([
        s.reference,
        s.employee.nomRP,
        s.status,
        s.declaredQuantity,
        s.validatedQuantity ?? '',
        rate,
        pnj,
        vq * pnj,
        vq * rate,
        iso(s.validatedAt),
      ]);
    }),
  ].join('\n');

  const payrollCsv = [
    csvRow(['employe', 'salaire', 'prime', 'total', 'statut', 'paye_le', 'payeur']),
    ...payrolls.map((p) =>
      csvRow([
        p.employee.nomRP,
        p.salaryAmount,
        p.bonusAmount,
        p.totalAmount,
        p.status,
        iso(p.paidAt),
        p.payerDiscordId ?? '',
      ]),
    ),
  ].join('\n');

  const label = week.startAt.toISOString().slice(0, 10);
  return {
    weekLabel: label,
    files: [
      { name: `ventes-${label}.csv`, content: salesCsv },
      { name: `paies-${label}.csv`, content: payrollCsv },
    ],
  };
}
