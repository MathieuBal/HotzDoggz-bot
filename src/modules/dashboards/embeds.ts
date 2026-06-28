import { EmbedBuilder } from 'discord.js';
import { EMBED_COLORS } from '../../config/constants.js';
import type { ClosureSummary } from '../accounting/closureService.js';
import { computeBonusShares } from '../accounting/weekReport.js';
import type { PersonalView, WeekReport } from '../accounting/weekReport.js';
import type { CompanyBoardData } from './companyBoard.js';
import type { OrderSummary } from '../orders/orderService.js';
import type { PartnerProgress } from '../partners/partnerService.js';
import type { PayrollLine } from '../payroll/payrollService.js';

const nf = new Intl.NumberFormat('fr-FR');
// Montants en chasse fixe (handoff §03) : aligne les colonnes et fait ressortir
// le chiffre. `qty` reste en texte courant (les unites sont moins "comptables").
const money = (n: number): string => `\`${nf.format(n)} $\``;
const qty = (n: number): string => nf.format(n);

/** Separateur de total unique (handoff §06) — fine barre, jamais plus epaisse. */
const TOTAL_SEPARATOR = '━━━━━━━━━━━━━━━';

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
            const brace = e.multiplier > 1 ? ` ×${e.multiplier}` : '';
            return `${rank} **${e.nomRP}** — ${qty(e.quantity)} u${brace} — ${money(e.salary)} (${e.gradeLabel ?? '—'})${star}`;
          })
          .join('\n');

  const best = report.bestEmployee
    ? report.bestTie
      ? `Egalite a ${qty(Math.round(report.bestEmployee.adjustedQuantity))} pts d’effort`
      : `**${report.bestEmployee.nomRP}** (${qty(Math.round(report.bestEmployee.adjustedQuantity))} pts d’effort)`
    : '—';

  return new EmbedBuilder()
    .setTitle('Tableau hebdomadaire — Employés')
    .setDescription(`${dateRange(startAt, endAt)}\n\n${lines}`)
    .setColor(EMBED_COLORS.production)
    .addFields({ name: 'Meilleur employé (provisoire)', value: best })
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
    .setColor(EMBED_COLORS.direction)
    .addFields(
      { name: "Chiffre d'affaires", value: money(report.totalRevenue), inline: true },
      { name: 'Salaires validés', value: money(report.totalSalaries), inline: true },
      { name: `Réserve (${report.rates.reservePercent} %)`, value: money(report.reserve), inline: true },
      { name: 'Bénéfice distribuable', value: money(report.distributable), inline: true },
      { name: `Prime (${report.rates.bonusPercent} %)`, value: money(report.bonus), inline: true },
      { name: `Directeur (${report.rates.directorPercent} %)`, value: money(report.directorShare), inline: true },
      { name: `Co-directeur (${report.rates.coDirectorPercent} %)`, value: money(report.coDirectorShare), inline: true },
      { name: 'Dossiers en attente', value: String(pendingCount), inline: true },
    )
    .addFields({ name: 'Salaires par employé', value: salaryBreakdown(report) })
    .setFooter({ text: 'Provisoire — paies finalisees a la cloture (Phase 5)' })
    .setTimestamp(new Date());
}

/** Detail des salaires par employe (deplace ici depuis l'ancien tableau hebdo). */
function salaryBreakdown(report: WeekReport): string {
  if (report.employees.length === 0) return '_Aucune vente validée cette semaine._';
  const lines = report.employees.map((e) => {
    const brace = e.multiplier > 1 ? ` ×${e.multiplier}` : '';
    return `• **${e.nomRP}** — ${qty(e.quantity)} u${brace} — ${money(e.salary)} (${e.gradeLabel ?? '—'})`;
  });
  const text = lines.join('\n');
  return text.length <= 1024 ? text : `${text.slice(0, 1000)}\n… (liste tronquée)`;
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
  return `Plus que **${qty(Math.ceil(view.gapToBest))} pts** d’effort pour ravir la premiere place a ${view.best.nomRP} !`;
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
  const best = view.best ? `${view.best.nomRP} — ${qty(Math.round(view.best.adjustedQuantity))} pts` : '—';
  // "pts" = production ajustee (bracelet neutralise) qui sert a la prime.
  const prod =
    view.multiplier > 1
      ? `${qty(view.quantity)} u (×${view.multiplier} → ${qty(Math.round(view.adjustedQuantity))} pts)`
      : `${qty(view.quantity)} u`;

  return new EmbedBuilder()
    .setTitle(`Ta comptabilite — ${nomRP}`)
    .setDescription(dateRange(startAt, endAt))
    .setColor(view.isLeader ? EMBED_COLORS.prime : EMBED_COLORS.production)
    .addFields(
      { name: 'Production validée', value: prod, inline: true },
      { name: 'Salaire provisoire', value: money(view.salary), inline: true },
      { name: 'Rang (course a la prime)', value: rank, inline: true },
      { name: 'Meilleur (effort ajuste)', value: best, inline: true },
      { name: 'Objectif', value: objectiveMessage(view) },
    )
    .setFooter({ text: 'C’est pas encore figé, tout peut bouger d’ici dimanche soir. Alors tu lâches rien.' })
    .setTimestamp(new Date());
}

/**
 * Variation par rapport a la semaine precedente, formatee pour affichage.
 * Pure (testable) : `(+12 %)`, `(-5 %)`, `(=)`, ou `(nouveau)` si pas de reference.
 */
export function formatDelta(current: number, previous: number | null): string {
  if (previous === null) return '';
  if (previous === 0) return current > 0 ? ' _(nouveau)_' : '';
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return ' (=)';
  return pct > 0 ? ` (+${pct} %)` : ` (${pct} %)`;
}

/** Tableau "Developpement de l'entreprise" (cote employes) — croissance & activite. */
export function buildCompanyBoard(data: CompanyBoardData): EmbedBuilder {
  const prev = data.previous;
  const activity = [
    `Hot dogs vendus : **${qty(data.current.units)}**${formatDelta(data.current.units, prev?.units ?? null)}`,
    `Chiffre d'affaires : ${money(data.current.revenue)}${formatDelta(data.current.revenue, prev?.revenue ?? null)}`,
    `Ventes validées : **${data.current.salesCount}**${formatDelta(data.current.salesCount, prev?.salesCount ?? null)}`,
    `Vendeurs actifs : **${data.current.activeSellers}**`,
  ].join('\n');

  const embed = new EmbedBuilder()
    .setTitle('📊 HotzDoggz — Developpement de l’entreprise')
    .setDescription(`${dateRange(data.weekStart, data.weekEnd)}\n\n${activity}`)
    .setColor(EMBED_COLORS.production);

  // Prime de la semaine (provisoire), repartie de facon degressive selon l'effort.
  const leader = data.topSellers[0];
  const bonusValue =
    `**${money(data.bonusPot)}**` +
    (leader ? ` — en tête : **${leader.nomRP}**` : ' — à jouer !');
  embed.addFields({
    name: '🏆 Prime de la semaine',
    value: `${bonusValue}\n_Répartie à la clôture, proportionnellement à l’effort produit (bracelet neutralisé)._`,
  });

  const news: string[] = [];
  if (data.newEmployees.length > 0) {
    news.push(`Bienvenue à : ${data.newEmployees.join(', ')}`);
  }
  for (const p of data.promotions) {
    news.push(`Promotion : **${p.nomRP}** → ${p.toLabel}`);
  }
  if (news.length > 0) {
    embed.addFields({ name: 'Du nouveau cette semaine', value: news.join('\n') });
  }

  // NB : le classement détaillé (avec parts de prime) vit dans le tableau
  // « Prime de la semaine » — on ne le duplique plus ici (cf. mutualisation).

  return embed
    .setFooter({ text: 'Mis a jour en direct — classement détaillé dans le salon prime' })
    .setTimestamp(new Date());
}

/**
 * Tableau "Prime de la semaine" (cote employes) : repartition PROPORTIONNELLE a
 * l'effort produit (ajuste du bracelet), en direct. Chaque producteur voit sa
 * part provisoire ; seuls ceux qui n'ont rien fait sont a 0. Total = la cagnotte.
 */
export function buildBonusBoard(report: WeekReport, startAt: Date, endAt: Date): EmbedBuilder {
  const shares = computeBonusShares(report);
  const eligible = report.employees.filter((e) => e.eligible && e.adjustedQuantity > 0);

  const embed = new EmbedBuilder()
    .setTitle('💰 Prime de la semaine — répartition en direct')
    .setColor(EMBED_COLORS.prime)
    .setTimestamp(new Date());

  if (report.bonus <= 0 || eligible.length === 0) {
    embed.setDescription(
      `${dateRange(startAt, endAt)}\n\n` +
        '_La cagnotte se remplit dès les premières ventes validées… Vendez !_',
    );
    return embed.setFooter({
      text: 'Cagnotte à zéro pour l’instant. Le grill est chaud, les clients poireautent, on attrape les pinces.',
    });
  }

  const lines = eligible
    .map((e, i) => {
      const medal = MEDALS[i] ?? `**${i + 1}.**`;
      const share = shares.get(e.employeeId) ?? 0;
      const adj =
        e.multiplier > 1
          ? `${qty(Math.round(e.adjustedQuantity))} pts _(${qty(e.quantity)} u ×${e.multiplier})_`
          : `${qty(e.quantity)} u`;
      return `${medal} **${e.nomRP}** — ${adj} → **${money(share)}**`;
    })
    .join('\n');

  return embed
    .setDescription(
      `${dateRange(startAt, endAt)}\n\n` +
        `**Cagnotte : ${money(report.bonus)}**\n\n${lines}`,
    )
    .setFooter({
      text: 'En direct les amis. Plus tu vends, plus ta part gonfle. Tu fais le calcul.',
    });
}

/** Tableau "commandes client a realiser" (cote direction). */
export function buildOrdersBoard(orders: readonly OrderSummary[], timezone: string): EmbedBuilder {
  const fmtDeadline = (d: Date | null): string =>
    d
      ? d.toLocaleDateString('fr-FR', { timeZone: timezone, day: '2-digit', month: '2-digit' })
      : '—';

  const blocks = orders.slice(0, 15).map((o) => {
    const head = o.status === 'LIVREE' ? '✅' : '⏳';
    const contrib =
      o.contributors.length > 0
        ? o.contributors.map((c) => `${c.nomRP} ${qty(c.quantity)}`).join(', ')
        : 'aucune';
    const tag = o.status === 'LIVREE' ? ' — _livré, à encaisser_' : '';
    return (
      `${head} **${o.reference}** · ${o.clientName}${tag}\n` +
      `Production ${qty(o.producedQuantity)}/${qty(o.targetQuantity)} u · ${money(o.negotiatedPrice)} · échéance ${fmtDeadline(o.deadline)}\n` +
      `Contrib : ${contrib}`
    );
  });

  const description =
    blocks.length > 0
      ? blocks.join('\n\n') +
        (orders.length > 15 ? `\n\n_… et ${orders.length - 15} autre(s)._` : '')
      : '_Aucune commande en cours._';

  return new EmbedBuilder()
    .setTitle('📋 Commandes client — à réaliser')
    .setColor(EMBED_COLORS.direction)
    .setDescription(description)
    .setFooter({ text: 'Mis à jour en direct · /commande pour gérer' })
    .setTimestamp(new Date());
}

/** Barre de progression textuelle (pure, testable). Ex. 52 % → █████░░░░░. */
export function progressBar(current: number, target: number, width = 10): string {
  if (target <= 0) return '░'.repeat(width);
  const ratio = Math.max(0, Math.min(1, current / target));
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** Tableau "Objectifs partenariats" (cote employes, live). */
export function buildPartnershipBoard(rows: readonly PartnerProgress[]): EmbedBuilder {
  const lines = rows
    .map((r) => {
      if (r.target === null) {
        return `**${r.name}** — ${qty(r.delivered)} u cette semaine _(pas d'objectif)_`;
      }
      const pct = r.target > 0 ? Math.round((r.delivered / r.target) * 100) : 0;
      const mark = r.reached ? ' ✅' : '';
      return (
        `**${r.name}**${mark}\n` +
        `${progressBar(r.delivered, r.target)} ${qty(r.delivered)}/${qty(r.target)} u (${pct} %)`
      );
    })
    .join('\n\n');

  return new EmbedBuilder()
    .setTitle('🤝 Objectifs partenariats (cette semaine)')
    .setColor(EMBED_COLORS.production)
    .setDescription(rows.length > 0 ? lines : '_Aucun partenaire pour le moment._')
    .setFooter({ text: 'Objectif hebdomadaire — se réinitialise chaque semaine' })
    .setTimestamp(new Date());
}

/** Bilan final de cloture (CDC §6.6). */
/** Celebration de fin de semaine, cote employes (sans la partie direction). */
export function buildWeekCelebration(summary: ClosureSummary, weekLabel: string): EmbedBuilder {
  const best = summary.bestEmployeeName
    ? summary.bestTie
      ? `🏆 **${summary.bestEmployeeName}** (ex æquo !)`
      : `🏆 **${summary.bestEmployeeName}**`
    : '—';
  const lines = [
    `**Chiffre d’affaires de la semaine : ${money(summary.totalRevenue)}**`,
    `Employé(e) de la semaine : ${best}`,
    `${summary.payrollCount} fiche${summary.payrollCount > 1 ? 's' : ''} de paie envoyée${summary.payrollCount > 1 ? 's' : ''} en MP.`,
    '',
    'Merci à toute l’équipe pour le travail accompli — on remet ça cette semaine !',
  ];
  return new EmbedBuilder()
    .setTitle(`🏆 Semaine bouclée — bravo l’équipe ! (${weekLabel})`)
    .setColor(EMBED_COLORS.prime)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Semaine pliée, vous avez tout déchiré. Le goût qui fait la diff, encore une fois. 🔥' })
    .setTimestamp(new Date());
}

export function buildClosureSummary(summary: ClosureSummary, weekLabel: string): EmbedBuilder {
  const best = summary.bestEmployeeName
    ? summary.bestTie
      ? `${summary.bestEmployeeName} (prime partagee — egalite)`
      : summary.bestEmployeeName
    : '—';
  return new EmbedBuilder()
    .setTitle(`Clôture de la semaine du ${weekLabel}${summary.forced ? ' (forcée)' : ''}`)
    .setColor(summary.forced ? EMBED_COLORS.alerte : EMBED_COLORS.direction)
    .addFields(
      { name: "Chiffre d'affaires", value: money(summary.totalRevenue), inline: true },
      { name: 'Salaires', value: money(summary.totalSalaries), inline: true },
      { name: `Réserve (${summary.rates.reservePercent} %)`, value: money(summary.reserve), inline: true },
      { name: 'Bénéfice distribuable', value: money(summary.distributable), inline: true },
      { name: `Prime (${summary.rates.bonusPercent} %)`, value: money(summary.bonus), inline: true },
      { name: 'Meilleur employé', value: best, inline: true },
      { name: `Directeur (${summary.rates.directorPercent} %)`, value: money(summary.directorShare), inline: true },
      { name: `Co-directeur (${summary.rates.coDirectorPercent} %)`, value: money(summary.coDirectorShare), inline: true },
      { name: 'Fiches de paie', value: String(summary.payrollCount), inline: true },
    )
    .setFooter({ text: 'Semaine clôturée par la direction. Rangez les pinces et comptez vos sous.' })
    .setTimestamp(new Date());
}

/** Liste des paies d'une semaine cloturee (CDC §5.5 / §6.7). */
export function buildPayrollList(
  weekLabel: string,
  payrolls: readonly PayrollLine[],
): EmbedBuilder {
  // Non payes d'abord (ce qui reste a verser), puis les payes ; chaque groupe
  // par montant decroissant pour reperer les grosses paies en premier.
  const ordered = [...payrolls].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'PAID' ? 1 : -1;
    return b.totalAmount - a.totalAmount;
  });

  const net = (p: PayrollLine): number => Math.max(0, p.totalAmount - p.advancedAmount);
  const lines =
    ordered.length === 0
      ? '_Aucune fiche de paie._'
      : ordered
          .map((p) => {
            const mark = p.status === 'PAID' ? '✅' : '⏳';
            const bonus = p.bonusAmount > 0 ? ` (+${money(p.bonusAmount)} prime)` : '';
            const adv = p.advancedAmount > 0 ? ` − acompte ${money(p.advancedAmount)}` : '';
            const reste = p.status === 'PAID' ? 'payée' : `**${money(net(p))}** à verser`;
            return `${mark} **${p.employee.nomRP}** — ${money(p.totalAmount)}${bonus}${adv} → ${reste}`;
          })
          .join('\n');

  const total = payrolls.reduce((s, p) => s + p.totalAmount, 0);
  const advances = payrolls.reduce((s, p) => s + p.advancedAmount, 0);
  const due = payrolls.filter((p) => p.status !== 'PAID').reduce((s, p) => s + net(p), 0);
  const dueCount = payrolls.filter((p) => p.status !== 'PAID').length;

  const summary =
    payrolls.length === 0
      ? ''
      : `\n\n${TOTAL_SEPARATOR}\n` +
        `**Reste à verser : ${money(due)}** (${dueCount} employé${dueCount > 1 ? 's' : ''})\n` +
        `Total des paies : ${money(total)}` +
        (advances > 0 ? ` · acomptes déjà versés : ${money(advances)}` : '');

  return new EmbedBuilder()
    .setTitle(`Paies — semaine du ${weekLabel}`)
    .setColor(due > 0 ? EMBED_COLORS.alerte : EMBED_COLORS.paie)
    .setDescription(lines + summary)
    .setFooter({ text: 'Tant que c’est en attente, c’est que j’ai pas encore sorti les billets. /paie marquer-payee une fois réglé.' })
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
    .setColor(EMBED_COLORS.paie)
    .setDescription(
      `Prix de vente PNJ : **${money(pnjUnitPrice)}/u**\n\n${lines || '_Aucun tarif actif._'}`,
    )
    .setTimestamp(new Date());
}
