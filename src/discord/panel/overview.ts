import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type BaseMessageOptions,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { getOpenWeekSnapshot } from '../../modules/accounting/accountingService.js';
import { listActiveOrders } from '../../modules/orders/orderService.js';
import { getPartnershipBoardData } from '../../modules/partners/partnerService.js';
import { listActiveProducts } from '../../modules/products/productService.js';
import { PanelButtonId, PanelEditValue, PanelSelectId } from '../components/ids.js';

const nf = new Intl.NumberFormat('fr-FR');
const money = (n: number): string => `${nf.format(n)} $`;

function clamp(value: string, max = 1024): string {
  return value.length > max ? value.slice(0, max - 1) + '…' : value;
}

/** Construit le message du panneau de gestion (vue d'ensemble + controles). */
export async function buildPanelMessage(guildConfigId: string): Promise<BaseMessageOptions> {
  const [snapshot, orders, partners, products, rates, gconfig] = await Promise.all([
    getOpenWeekSnapshot(guildConfigId),
    listActiveOrders(guildConfigId),
    getPartnershipBoardData(guildConfigId),
    listActiveProducts(guildConfigId),
    prisma.gradeRate.findMany({
      where: { guildConfigId, validTo: null },
      select: { label: true, ratePerUnit: true },
      orderBy: { ratePerUnit: 'desc' },
    }),
    prisma.guildConfig.findUnique({
      where: { id: guildConfigId },
      select: { pnjUnitPrice: true },
    }),
  ]);

  const embed = new EmbedBuilder()
    .setTitle('🎛️ Panneau de gestion HotzDogz')
    .setColor(0x34495e)
    .setTimestamp(new Date());

  embed.addFields({
    name: '🧮 Semaine',
    value: snapshot
      ? `Ouverte — CA **${money(snapshot.report.totalRevenue)}**, salaires **${money(snapshot.report.totalSalaries)}**, **${snapshot.pendingCount}** en attente`
      : '_Aucune semaine ouverte_ (bouton « Ouvrir la semaine »).',
  });

  embed.addFields({
    name: `📦 Commandes en cours (${orders.length})`,
    value: clamp(
      orders.length > 0
        ? orders
            .slice(0, 8)
            .map(
              (o) =>
                `• ${o.reference} ${o.clientName} — ${o.producedQuantity}/${o.targetQuantity} u`,
            )
            .join('\n')
        : '_aucune_',
    ),
  });

  embed.addFields({
    name: `🤝 Partenaires (${partners.length})`,
    value: clamp(
      partners.length > 0
        ? partners
            .map((p) =>
              p.target === null
                ? `• ${p.name} — ${p.delivered} u/sem`
                : `• ${p.name} — ${p.delivered}/${p.target} u/sem${p.reached ? ' ✅' : ''}`,
            )
            .join('\n')
        : '_aucun_',
    ),
  });

  embed.addFields({
    name: `🍴 Menu (${products.length})`,
    value: clamp(
      products.length > 0
        ? products.map((p) => `• ${p.name} — ${money(p.retailPrice)}`).join('\n')
        : '_aucun produit_',
    ),
  });

  embed.addFields({
    name: '💰 Grille salariale',
    value: clamp(
      rates.length > 0
        ? rates.map((r) => `• ${r.label} — ${money(r.ratePerUnit)}/u`).join('\n')
        : '_aucun tarif_',
    ),
  });

  embed.addFields({
    name: '💵 Prix de vente PNJ',
    value: money(gconfig?.pnjUnitPrice ?? 0),
    inline: true,
  });

  embed.setFooter({ text: 'Menu « Gérer » pour éditer/créer · boutons pour les actions' });

  const select = new StringSelectMenuBuilder()
    .setCustomId(PanelSelectId.EDIT)
    .setPlaceholder('⚙️ Gérer / modifier / créer…')
    .addOptions(
      { label: 'Salaire d’un grade', value: PanelEditValue.SALAIRE, emoji: '💰' },
      { label: 'Menu : ajouter / modifier un prix', value: PanelEditValue.MENU, emoji: '🍴' },
      { label: 'Menu : retirer un produit', value: PanelEditValue.MENU_RETIRER, emoji: '🗑️' },
      { label: 'Prix de vente PNJ', value: PanelEditValue.PNJ_PRIX, emoji: '💵' },
      { label: 'Créer un partenaire', value: PanelEditValue.PARTENAIRE_CREER, emoji: '🆕' },
      { label: 'Objectif d’un partenaire', value: PanelEditValue.PARTENAIRE, emoji: '🤝' },
      { label: 'Créer une commande client', value: PanelEditValue.COMMANDE_CREER, emoji: '📦' },
    );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PanelButtonId.OPEN_WEEK)
      .setLabel('Ouvrir la semaine')
      .setEmoji('📅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(snapshot !== null),
    new ButtonBuilder()
      .setCustomId(PanelButtonId.CLOSE_WEEK)
      .setLabel('Clôturer la semaine')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(snapshot === null),
    new ButtonBuilder()
      .setCustomId(PanelButtonId.REFRESH_BOARDS)
      .setLabel('Rafraîchir les tableaux')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(PanelButtonId.REFRESH)
      .setLabel('Rafraîchir')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), buttons],
  };
}
