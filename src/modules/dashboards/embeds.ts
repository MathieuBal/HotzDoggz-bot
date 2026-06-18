import { EmbedBuilder } from 'discord.js';
import type { PersonalView, WeekReport } from '../accounting/weekReport.js';

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

/** Message motivant selon la position de l'employe vis-a-vis du meilleur. */
function objectiveMessage(view: PersonalView): string {
  if (!view.eligible) {
    return 'Tu produis pour l’equipe (direction : hors prime du meilleur employe).';
  }
  if (!view.best) {
    return 'Sois le premier a vendre cette semaine !';
  }
  if (view.isLeader) {
    return view.tieAtTop
      ? '🤝 Egalite en tete — accelere pour prendre le large !'
      : '🏆 Tu es en tete ! Garde le rythme.';
  }
  return `Plus que **${qty(view.gapToBest)} u** pour ravir la premiere place a ${view.best.nomRP} !`;
}

/** Fiche perso de suivi de compta d'un employe (CDC §7.4). */
export function buildPersonalBoard(
  nomRP: string,
  view: PersonalView,
  startAt: Date,
  endAt: Date,
): EmbedBuilder {
  const rank =
    view.rankAmongEligible !== null ? `#${view.rankAmongEligible}` : '— (hors prime, direction)';
  const best = view.best ? `${view.best.nomRP} — ${qty(view.best.quantity)} u` : '—';

  return new EmbedBuilder()
    .setTitle(`Ta comptabilite — ${nomRP}`)
    .setDescription(dateRange(startAt, endAt))
    .setColor(view.isLeader ? 0xf1c40f : 0xff7a00)
    .addFields(
      { name: 'Production validee', value: `${qty(view.quantity)} u`, inline: true },
      { name: 'Salaire provisoire', value: money(view.salary), inline: true },
      { name: 'Rang (course a la prime)', value: rank, inline: true },
      { name: 'Meilleur employe', value: best, inline: true },
      { name: 'Objectif', value: objectiveMessage(view) },
    )
    .setFooter({ text: 'Provisoire — definitif a la cloture' })
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
