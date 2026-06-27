import { MessageFlags, type ModalSubmitInteraction, type ThreadChannel } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../infrastructure/database/client.js';
import {
  refuseDirectSale,
  validateDirectSale,
} from '../../modules/directSales/directSaleService.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import {
  getGuildConfigByGuildId,
  resolveMemberGrade,
} from '../../modules/employees/employeeService.js';
import { SaleStatus } from '@prisma/client';
import { DirectSaleFieldId, DirectSaleModalId } from '../components/ids.js';
import { refreshDirectFiche } from '../directSales/fiche.js';
import { applyCasierEffects, archiveFiche } from '../verification/ficheHelpers.js';
import { sendEmployeeDM } from '../notify.js';
import { isDirectionMember } from '../permissions.js';

const KNOWN = new Set<string>(Object.values(DirectSaleModalId));

/** @returns true si l'interaction a ete prise en charge ici. */
export async function handleDirectSaleModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!KNOWN.has(interaction.customId)) return false;

  const ephemeral = MessageFlags.Ephemeral;
  if (!interaction.guild || !interaction.channelId) {
    await interaction.reply({ content: 'Contexte invalide.', flags: ephemeral });
    return true;
  }
  const config = await getGuildConfigByGuildId(interaction.guild.id);
  if (!config) {
    await interaction.reply({ content: 'Configuration absente.', flags: ephemeral });
    return true;
  }
  if (!(await isDirectionMember(interaction.guild, interaction.user.id, config))) {
    await interaction.reply({ content: 'Action réservée à la direction.', flags: ephemeral });
    return true;
  }

  const sale = await prisma.directSale.findUnique({
    where: { controlThreadId: interaction.channelId },
    include: { lines: true, employee: { select: { discordUserId: true, casierForumId: true } } },
  });
  if (!sale) {
    await interaction.reply({ content: 'Fiche non reconnue.', flags: ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: ephemeral });
  const actorId = interaction.user.id;
  const thread = interaction.channel as ThreadChannel;
  const correlationId = randomUUID();

  if (interaction.customId === DirectSaleModalId.REFUSE) {
    const reason = interaction.fields.getTextInputValue(DirectSaleFieldId.REASON).trim();
    if (!reason) {
      await interaction.editReply('Motif obligatoire.');
      return true;
    }
    const res = await refuseDirectSale(sale.id, actorId, reason, correlationId);
    if (!res.ok) {
      await interaction.editReply(res.reason);
      return true;
    }
    await refreshDirectFiche(thread, sale.id);
    if (sale.threadId) {
      await applyCasierEffects(interaction.client, {
        threadId: sale.threadId,
        casierForumId: sale.employee.casierForumId,
        status: SaleStatus.REFUSEE,
        message: `❌ Vente **${res.data.reference}** refusée.\nMotif : ${reason}`,
      }).catch(() => undefined);
    }
    await sendEmployeeDM(
      interaction.client,
      sale.employee.discordUserId,
      `❌ Ta vente main-en-main **${res.data.reference}** a été refusée par la direction.\nMotif : ${reason}`,
    );
    await interaction.editReply(`Vente ${res.data.reference} refusée.`);
    return true;
  }

  // VALIDATE : quantites par ligne + note + re-resolution du grade.
  const note = interaction.fields.getTextInputValue(DirectSaleFieldId.NOTE).trim();
  if (!note) {
    await interaction.editReply('La note de vérification est obligatoire.');
    return true;
  }
  const lineQuantities: { lineId: string; validatedQuantity: number }[] = [];
  for (const l of sale.lines) {
    const raw = interaction.fields.getTextInputValue(l.id).trim();
    const q = Number(raw);
    if (!Number.isInteger(q) || q < 0) {
      await interaction.editReply(`Quantité invalide pour « ${l.productName} ».`);
      return true;
    }
    lineQuantities.push({ lineId: l.id, validatedQuantity: q });
  }

  // Grade re-resolu (bloque en cas d'anomalie, comme le PNJ).
  const member = await interaction.guild.members
    .fetch(sale.employee.discordUserId)
    .catch(() => null);
  if (!member) {
    await interaction.editReply('Membre employé introuvable : grade non résoluble.');
    return true;
  }
  const grade = await resolveMemberGrade(member, config.id);
  if (!grade.selected || grade.missing || grade.ambiguous) {
    await interaction.editReply(
      'Anomalie de grade (aucun ou plusieurs grades reconnus). Corrige les rôles avant de valider.',
    );
    return true;
  }

  const res = await validateDirectSale({
    saleId: sale.id,
    actorId,
    lineQuantities,
    note,
    gradeLabel: grade.selected.label,
    gradeRoleId: grade.selected.roleId,
    salaryRate: grade.selected.ratePerUnit,
    correlationId,
  });
  if (!res.ok) {
    await interaction.editReply(res.reason);
    return true;
  }
  await refreshDirectFiche(thread, sale.id);
  if (sale.threadId) {
    await applyCasierEffects(interaction.client, {
      threadId: sale.threadId,
      casierForumId: sale.employee.casierForumId,
      status: SaleStatus.VALIDEE,
      message: `✅ Vente **${res.data.reference}** validée — CA ${res.data.revenue} $, salaire ${res.data.salaryAmount} $.`,
    }).catch(() => undefined);
  }
  // Vente directe close : on range la fiche hors du forum actif (réversible).
  await archiveFiche(thread, sale.id);
  scheduleDashboardUpdate(interaction.client, config.id);
  await interaction.editReply(
    `Vente ${res.data.reference} validée — CA ${res.data.revenue} $, salaire ${res.data.salaryAmount} $.`,
  );
  return true;
}
