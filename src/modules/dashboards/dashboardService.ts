import { ChannelType, EmbedBuilder, type Client, type MessageCreateOptions } from 'discord.js';
import { GARAGE_STOCK_ENABLED } from '../../config/constants.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import type { ClosureSummary } from '../accounting/closureService.js';
import { getOpenWeekSnapshot } from '../accounting/accountingService.js';
import { listActiveOrders } from '../orders/orderService.js';
import { getPartnershipBoardData } from '../partners/partnerService.js';
import { getCompanyBoardData } from './companyBoard.js';
import { publishPlanningBoard } from '../../discord/planning/planningBoard.js';
import { publishStockBoard } from '../../discord/stock/stockBoard.js';
import { publishGarageBoard } from '../../discord/garage/garageBoard.js';
import {
  buildAccountingBoard,
  buildBonusBoard,
  buildClosureSummary,
  buildCompanyBoard,
  buildEmployeeBoard,
  buildOrdersBoard,
  buildPartnershipBoard,
  buildSalaryGrid,
} from './embeds.js';

/**
 * Tableaux permanents (CDC §5.5 / §7.4) : le bot edite TOUJOURS le meme message,
 * dont l'identifiant est conserve en base. Au demarrage / a la mise a jour, il
 * verifie l'existence du message et le recree au besoin.
 */

interface EnsureResult {
  messageId: string | null;
  changed: boolean;
}

async function ensureMessage(
  client: Client,
  channelId: string | null,
  messageId: string | null,
  embed: EmbedBuilder,
): Promise<EnsureResult> {
  if (!channelId) return { messageId, changed: false };
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    logger.warn({ channelId }, 'Salon de tableau introuvable ou non textuel');
    return { messageId, changed: false };
  }

  const payload = { embeds: [embed] } satisfies MessageCreateOptions;

  if (messageId) {
    try {
      const msg = await channel.messages.fetch(messageId);
      await msg.edit({ embeds: [embed] });
      return { messageId, changed: false };
    } catch {
      // message supprime -> on le recree (CDC §11 : dashboard supprime)
      logger.warn({ channelId, messageId }, 'Message permanent absent — recreation');
    }
  }
  const created = await channel.send(payload);
  return { messageId: created.id, changed: true };
}

function placeholder(title: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0x95a5a6)
    .setDescription('Aucune semaine comptable ouverte (`/semaine ouvrir`).')
    .setTimestamp(new Date());
}

/** Reconstruit/actualise les 3 tableaux permanents d'un serveur. */
export async function updateDashboards(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config) return;

  const snapshot = await getOpenWeekSnapshot(guildConfigId);

  const employeeEmbed = snapshot
    ? buildEmployeeBoard(snapshot.report, snapshot.week.startAt, snapshot.week.endAt)
    : placeholder('Tableau hebdomadaire — Employes');
  const accountingEmbed = snapshot
    ? buildAccountingBoard(
        snapshot.report,
        snapshot.week.startAt,
        snapshot.week.endAt,
        snapshot.pendingCount,
      )
    : placeholder('Tableau comptable — Direction');

  const rates = await prisma.gradeRate.findMany({
    where: { guildConfigId, validTo: null },
    select: { label: true, ratePerUnit: true },
  });
  const gridEmbed = buildSalaryGrid(rates, config.pnjUnitPrice);

  const companyData = await getCompanyBoardData(guildConfigId);
  const companyEmbed = companyData
    ? buildCompanyBoard(companyData)
    : placeholder('📊 HotzDoggz — Developpement de l’entreprise');
  // Salon employe dedie si configure, sinon repli sur le tableau hebdo.
  const companyChannel = config.channelCompanyBoard ?? config.channelWeeklyBoard;

  const orders = await listActiveOrders(guildConfigId);
  const ordersEmbed = buildOrdersBoard(orders, config.timezone);

  const partners = await getPartnershipBoardData(guildConfigId);
  const partnersEmbed = buildPartnershipBoard(partners);
  // Salon employe dedie si configure, sinon repli sur le tableau de croissance/hebdo.
  const partnersChannel =
    config.channelPartnerships ?? config.channelCompanyBoard ?? config.channelWeeklyBoard;

  const bonusEmbed = snapshot
    ? buildBonusBoard(snapshot.report, snapshot.week.startAt, snapshot.week.endAt)
    : placeholder('💸 Prime de la semaine — répartition en direct');

  const [emp, acc, grid, company, ord, part, bonus] = await Promise.all([
    ensureMessage(client, config.channelWeeklyBoard, config.msgWeeklyEmployees, employeeEmbed),
    ensureMessage(client, config.channelAccounting, config.msgAccounting, accountingEmbed),
    ensureMessage(client, config.channelWeeklyBoard, config.msgSalaryGrid, gridEmbed),
    ensureMessage(client, companyChannel, config.msgCompanyBoard, companyEmbed),
    ensureMessage(client, config.channelOrders, config.msgOrdersBoard, ordersEmbed),
    ensureMessage(client, partnersChannel, config.msgPartnershipBoard, partnersEmbed),
    ensureMessage(client, config.channelBonusBoard, config.msgBonusBoard, bonusEmbed),
  ]);

  const data: Record<string, string> = {};
  if (emp.changed && emp.messageId) data.msgWeeklyEmployees = emp.messageId;
  if (acc.changed && acc.messageId) data.msgAccounting = acc.messageId;
  if (grid.changed && grid.messageId) data.msgSalaryGrid = grid.messageId;
  if (company.changed && company.messageId) data.msgCompanyBoard = company.messageId;
  if (ord.changed && ord.messageId) data.msgOrdersBoard = ord.messageId;
  if (part.changed && part.messageId) data.msgPartnershipBoard = part.messageId;
  if (bonus.changed && bonus.messageId) data.msgBonusBoard = bonus.messageId;
  if (Object.keys(data).length > 0) {
    await prisma.guildConfig.update({ where: { id: guildConfigId }, data });
  }

  // Agenda planning (embed + menu de positionnement) : gere son propre message.
  await publishPlanningBoard(client, guildConfigId).catch((err) =>
    logger.warn({ err, guildConfigId }, 'Mise a jour de l agenda planning KO'),
  );
  // Module garage / stock mis de cote (cf. GARAGE_STOCK_ENABLED) : on ne publie
  // ni le tableau de stock ni le catalogue garage tant qu'il est desactive.
  if (GARAGE_STOCK_ENABLED) {
    // Tableau de stock (saucisses + lots perissables).
    await publishStockBoard(client, guildConfigId).catch((err) =>
      logger.warn({ err, guildConfigId }, 'Mise a jour du tableau stock KO'),
    );
    // Catalogue garage (vehicules + attribution).
    await publishGarageBoard(client, guildConfigId).catch((err) =>
      logger.warn({ err, guildConfigId }, 'Mise a jour du catalogue garage KO'),
    );
  }
}

/**
 * Publie le bilan final de cloture dans le salon comptabilite, comme archive
 * permanente (nouveau message, CDC §6.6 : "Publier le bilan final").
 */
export async function postClosureReport(
  client: Client,
  guildConfigId: string,
  summary: ClosureSummary,
  weekLabel: string,
): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelAccounting) return;
  const channel = await client.channels.fetch(config.channelAccounting).catch(() => null);
  if (channel?.type === ChannelType.GuildText) {
    await channel
      .send({ embeds: [buildClosureSummary(summary, weekLabel)] })
      .catch((err) => logger.warn({ err }, 'Publication du bilan de cloture KO'));
  }
}
