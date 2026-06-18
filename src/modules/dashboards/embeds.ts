import { EmbedBuilder } from 'discord.js';
import type { WeekReport } from '../accounting/weekReport.js';

const nf = new Intl.NumberFormat('fr-FR');
const money = (n: number): string => `${nf.format(n)} $`;
const qty = (n: number): string => nf.format(n);

function dateRange(startAt: Date, endAt: Date): string {
  const fmt = (d: Date): string =>
    d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
  return `Semaine du ${fmt(startAt)} au ${fmt(endAt)}`;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** Tableau hebdomadaire employes (CDC §5.5). */
export function buildEmployeeBoard(report: WeekReport, startAt: Date, endAt: Date): EmbedBuilder {
  const lines =
    report.employees.length === 0
      ? '_Aucune vente validee cette semaine._'
      : report.employees
          .map((e, i) => {
            const rank = MEDALS[i] ?? `**${i + 1}.**`;
            const star = e.eligible ? '' : ' _(hors prime)_';
            return `${rank} **${e.nomRP}** — ${qty(e.quantity)} u — ${money(e.salary)} (${e.gradeLabel ?? '—'})${star}`;
          })
          .join('\n');

  const best = report.bestEmployee
    ? report.bestTie
      ? `Egalite a ${qty(report.bestEmployee.quantity)} u — a departager a la cloture`
      : `**${report.bestEmployee.nomRP}** (${qty(report.bestEmployee.quantity)} u) — prime provisoire ${money(report.bonus)}`
    : '—';

  return new EmbedBuilder()
    .setTitle('Tableau hebdomadaire — Employes')
    .setDescription(`${dateRange(startAt, endAt)}\n\n${lines}`)
    .setColor(0xff7a00)
    .addFields({ name: 'Meilleur employe (provisoire)', value: best })
    .setFooter({ text: 'Provisoire — definitif a la cloture' })
    .setTimestamp(new Date());
}

/** Tableau comptable direction (CDC §5.5). */
export function buildAccountingBoard(
  report: WeekReport,
  startAt: Date,
  endAt: Date,
  pendingCount: number,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('Tableau comptable — Direction')
    .setDescription(dateRange(startAt, endAt))
    .setColor(0x2e86de)
    .addFields(
      { name: "Chiffre d'affaires", value: money(report.totalRevenue), inline: true },
      { name: 'Salaires valides', value: money(report.totalSalaries), inline: true },
      { name: 'Reserve (5 %)', value: money(report.reserve), inline: true },
      { name: 'Benefice distribuable', value: money(report.distributable), inline: true },
      { name: 'Prime (35 %)', value: money(report.bonus), inline: true },
      { name: 'Directeur (40 %)', value: money(report.directorShare), inline: true },
      { name: 'Co-directeur (25 %)', value: money(report.coDirectorShare), inline: true },
      { name: 'Dossiers en attente', value: String(pendingCount), inline: true },
    )
    .setFooter({ text: 'Provisoire — paies finalisees a la cloture (Phase 5)' })
    .setTimestamp(new Date());
}

export interface GradeRateView {
  label: string;
  ratePerUnit: number;
}

/** Grille salariale (CDC §5.5). */
export function buildSalaryGrid(
  rates: readonly GradeRateView[],
  pnjUnitPrice: number,
): EmbedBuilder {
  const lines = [...rates]
    .sort((a, b) => b.ratePerUnit - a.ratePerUnit)
    .map((r) => `• **${r.label}** — ${money(r.ratePerUnit)}/u`)
    .join('\n');
  return new EmbedBuilder()
    .setTitle('Grille salariale')
    .setColor(0x27ae60)
    .setDescription(
      `Prix de vente PNJ : **${money(pnjUnitPrice)}/u**\n\n${lines || '_Aucun tarif actif._'}`,
    )
    .setTimestamp(new Date());
}
