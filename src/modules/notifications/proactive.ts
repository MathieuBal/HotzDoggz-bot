import { ClientOrderStatus, SaleStatus } from '@prisma/client';
import { type Client, EmbedBuilder } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { mentionDirection, postToLogs } from '../../discord/notify.js';
import { getGuildConfigByGuildId } from '../employees/employeeService.js';
import { getLatestClosedPayrolls } from '../payroll/payrollService.js';
import { isClosureReminderWindow, localWeekdayHour } from './timeWindow.js';

/**
 * Notifications proactives (CDC §5.6 / §6.7) : le bot ne se contente pas de
 * reagir, il relance. Trois mecanismes :
 *   - rappel des ventes en attente de validation depuis trop longtemps ;
 *   - rappel de cloture le dimanche soir si une semaine est ouverte ;
 *   - envoi de la fiche de paie individuelle en DM a la cloture.
 */

const PENDING_AGE_HOURS = 24;
const PENDING_REMINDER_COOLDOWN_MS = 12 * 3_600_000;
const PENDING_STATUSES = [SaleStatus.SOUMISE, SaleStatus.EN_VERIFICATION, SaleStatus.INCOMPLETE];

const DELIVERED_UNPAID_AGE_HOURS = 24;

// Etat anti-spam en memoire (reset au redemarrage : au pire un rappel de plus).
// Toutes ces structures sont indexees par guildConfigId => bornees par le nombre
// de serveurs (ne croissent pas avec le temps). On retient la DERNIERE semaine
// rappelee par serveur (et non l'ensemble cumulatif des semaines), pour eviter
// une fuite d'une entree par semaine sur un process 24/7.
const lastPendingReminderAt = new Map<string, number>();
const lastOrdersReminderAt = new Map<string, number>();
const lastClosureReminderWeekByGuild = new Map<string, string>();

const nf = new Intl.NumberFormat('fr-FR');
const money = (n: number): string => `${nf.format(n)} $`;

/** Rappel des ventes en attente depuis plus de 24 h (digest, throttle 12 h). */
async function checkPendingValidations(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelLogs) return;

  const cutoff = new Date(Date.now() - PENDING_AGE_HOURS * 3_600_000);
  const count = await prisma.sale.count({
    where: { guildConfigId, status: { in: PENDING_STATUSES }, submittedAt: { lt: cutoff } },
  });
  if (count === 0) return;

  const last = lastPendingReminderAt.get(guildConfigId) ?? 0;
  if (Date.now() - last < PENDING_REMINDER_COOLDOWN_MS) return;

  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) return;
  await postToLogs(guild, config, {
    content: `${mentionDirection(config)} ⏰ **${count}** vente(s) en attente de validation depuis plus de ${PENDING_AGE_HOURS} h. Pensez a les traiter.`,
  });
  lastPendingReminderAt.set(guildConfigId, Date.now());
}

/** Rappel de cloture le dimanche soir si une semaine est encore ouverte. */
async function checkClosureReminder(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelLogs) return;

  const { weekday, hour } = localWeekdayHour(new Date(), config.timezone);
  if (
    !isClosureReminderWindow(weekday, hour, {
      weekday: config.closureReminderWeekday,
      hourStart: config.closureReminderHourStart,
      hourEnd: config.closureReminderHourEnd,
    })
  )
    return;

  const week = await prisma.accountingWeek.findFirst({
    where: { guildConfigId, status: 'OPEN' },
    select: { id: true },
  });
  if (!week || lastClosureReminderWeekByGuild.get(guildConfigId) === week.id) return;

  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) return;
  await postToLogs(guild, config, {
    content: `${mentionDirection(config)} 📅 Fin de semaine : pensez a **cloturer la semaine comptable** (\`/semaine cloturer\`) une fois les dernieres ventes validees.`,
  });
  lastClosureReminderWeekByGuild.set(guildConfigId, week.id);
}

/**
 * Rappel sur les commandes client : livrees mais pas encore encaissees depuis
 * plus de 24 h, ou ouvertes dont l'echeance est depassee (digest, throttle 12 h).
 */
async function checkOrders(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelLogs) return;

  const deliveredCutoff = new Date(Date.now() - DELIVERED_UNPAID_AGE_HOURS * 3_600_000);
  const [unpaid, overdue] = await Promise.all([
    prisma.clientOrder.count({
      where: {
        guildConfigId,
        status: ClientOrderStatus.LIVREE,
        deliveredAt: { lt: deliveredCutoff },
      },
    }),
    prisma.clientOrder.count({
      where: { guildConfigId, status: ClientOrderStatus.OUVERTE, deadline: { lt: new Date() } },
    }),
  ]);
  if (unpaid === 0 && overdue === 0) return;

  const last = lastOrdersReminderAt.get(guildConfigId) ?? 0;
  if (Date.now() - last < PENDING_REMINDER_COOLDOWN_MS) return;

  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) return;
  const parts: string[] = [];
  if (unpaid > 0) {
    parts.push(`💸 **${unpaid}** commande(s) livrée(s) non encaissée(s) (\`/commande payer\`)`);
  }
  if (overdue > 0) parts.push(`⏳ **${overdue}** commande(s) ouverte(s) en retard sur l'échéance`);
  await postToLogs(guild, config, {
    content: `${mentionDirection(config)} ${parts.join(' · ')}.`,
  });
  lastOrdersReminderAt.set(guildConfigId, Date.now());
}

/** Boucle periodique : passe en revue chaque serveur configure. */
export async function runProactiveChecks(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    const config = await getGuildConfigByGuildId(guild.id);
    if (!config) continue;
    await checkPendingValidations(client, config.id).catch((err) =>
      logger.warn({ err, guildConfigId: config.id }, 'Rappel ventes en attente KO'),
    );
    await checkClosureReminder(client, config.id).catch((err) =>
      logger.warn({ err, guildConfigId: config.id }, 'Rappel de cloture KO'),
    );
    await checkOrders(client, config.id).catch((err) =>
      logger.warn({ err, guildConfigId: config.id }, 'Rappel commandes KO'),
    );
  }
}

/**
 * Envoie a chaque employe sa fiche de paie en message prive, a la cloture
 * (CDC §6.7). Silencieux si l'employe a ferme ses DM. A appeler apres cloture.
 */
export async function sendPayslips(client: Client, guildConfigId: string): Promise<void> {
  const latest = await getLatestClosedPayrolls(guildConfigId);
  if (!latest) return;
  const weekLabel = latest.week.startAt.toISOString().slice(0, 10);

  for (const p of latest.payrolls) {
    const embed = new EmbedBuilder()
      .setTitle('🧾 Ta fiche de paie HotzDoggz')
      .setDescription(`Semaine du ${weekLabel}`)
      .setColor(0x8e44ad)
      .addFields(
        { name: 'Salaire', value: money(p.salaryAmount), inline: true },
        { name: 'Prime', value: money(p.bonusAmount), inline: true },
        { name: 'Total', value: money(p.totalAmount), inline: true },
      )
      .setTimestamp(new Date());
    try {
      const user = await client.users.fetch(p.employee.discordUserId);
      await user.send({ embeds: [embed] });
    } catch {
      logger.info({ employee: p.employee.nomRP }, 'Fiche de paie en DM non remise (DM fermes ?)');
    }
  }
}
