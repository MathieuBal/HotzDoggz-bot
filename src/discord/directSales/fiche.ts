import { type DirectSale, type DirectSaleLine, SaleRisk, SaleStatus } from '@prisma/client';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ForumChannel,
  type ThreadChannel,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { computeDirectSaleTotals } from '../../modules/directSales/directSaleReference.js';
import { riskBadge } from '../../modules/sales/fraud.js';
import { controlLabel } from '../../modules/sales/statusLabels.js';
import { DirectSaleButtonId } from '../components/ids.js';

const nf = new Intl.NumberFormat('fr-FR');
const money = (n: number): string => `${nf.format(n)} $`;

type FicheSale = DirectSale & { lines: DirectSaleLine[]; employee: { nomRP: string } };

function qtyOf(line: DirectSaleLine): number {
  return line.validatedQuantity ?? line.declaredQuantity;
}

function buildEmbed(sale: FicheSale): EmbedBuilder {
  const linesTxt = sale.lines
    .map(
      (l) =>
        `• ${l.productName} ×${qtyOf(l)} @ ${money(l.unitPrice)} = ${money(qtyOf(l) * l.unitPrice)}`,
    )
    .join('\n');
  const { totalQuantity, revenue } = computeDirectSaleTotals(
    sale.lines.map((l) => ({ unitPrice: l.unitPrice, quantity: qtyOf(l) })),
  );
  const salary = totalQuantity * (sale.salaryRateSnapshot ?? 0);

  const embed = new EmbedBuilder()
    .setTitle(`VENTE ${sale.reference} — ${sale.employee.nomRP}`)
    .setColor(sale.status === SaleStatus.REFUSEE ? 0xcc0000 : 0xff7a00)
    .setDescription(linesTxt || '_aucune ligne_')
    .addFields(
      { name: 'Employe', value: sale.employee.nomRP, inline: true },
      { name: 'Grade', value: sale.gradeSnapshot ?? '— (a verifier)', inline: true },
      { name: 'Client', value: sale.buyerName || '—', inline: true },
      { name: "Chiffre d'affaires", value: money(revenue), inline: true },
      { name: 'Quantite totale', value: `${totalQuantity}`, inline: true },
      { name: 'Salaire estime', value: money(salary), inline: true },
      { name: 'Statut', value: controlLabel(sale.status), inline: true },
    );
  if ((sale.riskLevel ?? SaleRisk.CLEAN) !== SaleRisk.CLEAN) {
    embed.addFields({
      name: `${riskBadge(sale.riskLevel)} Controle d'integrite`,
      value: sale.riskReasons || 'A verifier.',
    });
    if (sale.riskLevel === SaleRisk.FLAGGED) embed.setColor(0xcc0000);
  }
  return embed;
}

const ENABLED: Record<SaleStatus, Set<string>> = {
  [SaleStatus.SOUMISE]: new Set([
    DirectSaleButtonId.TAKE,
    DirectSaleButtonId.VALIDATE,
    DirectSaleButtonId.REFUSE,
  ]),
  [SaleStatus.EN_VERIFICATION]: new Set([DirectSaleButtonId.VALIDATE, DirectSaleButtonId.REFUSE]),
  [SaleStatus.INCOMPLETE]: new Set([DirectSaleButtonId.VALIDATE, DirectSaleButtonId.REFUSE]),
  [SaleStatus.VALIDEE]: new Set(),
  [SaleStatus.INTEGREE_A_LA_PAIE]: new Set(),
  [SaleStatus.PAYEE]: new Set(),
  [SaleStatus.REFUSEE]: new Set(),
  [SaleStatus.ANNULEE]: new Set(),
};

function buildComponents(status: SaleStatus): ActionRowBuilder<ButtonBuilder>[] {
  const enabled = ENABLED[status];
  const btn = (id: string, label: string, style: ButtonStyle): ButtonBuilder =>
    new ButtonBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setDisabled(!enabled.has(id));
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      btn(DirectSaleButtonId.TAKE, 'Prendre en charge', ButtonStyle.Primary),
      btn(DirectSaleButtonId.VALIDATE, 'Valider', ButtonStyle.Success),
      btn(DirectSaleButtonId.REFUSE, 'Refuser', ButtonStyle.Danger),
    ),
  ];
}

/** Cree la fiche de controle d'une vente main en main dans le Forum de controle. */
export async function createDirectControlPost(
  controlForum: ForumChannel,
  sale: FicheSale,
  mentionContent: string,
): Promise<ThreadChannel> {
  return controlForum.threads.create({
    name: `${sale.reference} — ${sale.employee.nomRP}`,
    message: {
      content: mentionContent || undefined,
      embeds: [buildEmbed(sale)],
      components: buildComponents(sale.status),
    },
  });
}

/** Rafraichit la fiche (embed + boutons) depuis l'etat en base. */
export async function refreshDirectFiche(thread: ThreadChannel, saleId: string): Promise<void> {
  const sale = await prisma.directSale.findUnique({
    where: { id: saleId },
    include: { lines: true, employee: { select: { nomRP: true } } },
  });
  if (!sale) return;
  const starter = await thread.fetchStarterMessage().catch(() => null);
  if (!starter) return;
  await starter
    .edit({ embeds: [buildEmbed(sale)], components: buildComponents(sale.status) })
    .catch((err) => logger.warn({ err, saleId }, 'Rafraichissement fiche vente directe KO'));
}
