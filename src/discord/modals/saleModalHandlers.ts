import { SaleStatus } from '@prisma/client';
import { MessageFlags, type ModalSubmitInteraction, type ThreadChannel } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../infrastructure/database/client.js';
import {
  getGuildConfigByGuildId,
  resolveMemberGrade,
} from '../../modules/employees/employeeService.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import { parseQuantityField } from '../../modules/sales/quantity.js';
import {
  correctSale,
  refuseSale,
  requestComplement,
  validateSale,
} from '../../modules/verification/verificationService.js';
import { SaleFieldId, SaleModalId } from '../components/ids.js';
import { isDirectionMember } from '../permissions.js';
import { applyCasierEffects, refreshFiche } from '../verification/ficheHelpers.js';

const KNOWN = new Set<string>(Object.values(SaleModalId));

/** @returns true si l'interaction a ete prise en charge ici. */
export async function handleSaleModal(interaction: ModalSubmitInteraction): Promise<boolean> {
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
    await interaction.reply({ content: 'Action reservee a la direction.', flags: ephemeral });
    return true;
  }

  const sale = await prisma.sale.findUnique({
    where: { controlThreadId: interaction.channelId },
    include: { employee: { select: { discordUserId: true } } },
  });
  if (!sale) {
    await interaction.reply({ content: 'Fiche de controle non reconnue.', flags: ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: ephemeral });
  const actorId = interaction.user.id;
  const guildId = interaction.guild.id;
  const thread = interaction.channel as ThreadChannel;
  const client = interaction.client;
  const correlationId = randomUUID();

  switch (interaction.customId) {
    case SaleModalId.VALIDATE: {
      const qty = parseQuantityField(interaction.fields.getTextInputValue(SaleFieldId.QUANTITY));
      const note = interaction.fields.getTextInputValue(SaleFieldId.NOTE).trim();
      const comment = interaction.fields.getTextInputValue(SaleFieldId.COMMENT).trim();
      if (qty === null) {
        await interaction.editReply('Quantite validee invalide.');
        return true;
      }
      if (!note) {
        await interaction.editReply('La note de verification est obligatoire.');
        return true;
      }

      // Blocage du calcul en cas d'anomalie de grade (CDC §11).
      const member = await interaction.guild.members
        .fetch(sale.employee.discordUserId)
        .catch(() => null);
      if (!member) {
        await interaction.editReply('Membre employe introuvable : grade non resoluble.');
        return true;
      }
      const grade = await resolveMemberGrade(member, config.id);
      if (!grade.selected || grade.missing || grade.ambiguous) {
        await interaction.editReply(
          `Anomalie de grade (${grade.missing ? 'aucun grade reconnu' : 'plusieurs grades'}). ` +
            'Corrige les roles de l’employe avant de valider.',
        );
        return true;
      }

      const res = await validateSale({
        saleId: sale.id,
        actorId,
        validatedQuantity: qty,
        note,
        comment: comment || null,
        gradeLabel: grade.selected.label,
        gradeRoleId: grade.selected.roleId,
        salaryRate: grade.selected.ratePerUnit,
        pnjUnitPrice: config.pnjUnitPrice,
        correlationId,
      });
      if (!res.ok) {
        await interaction.editReply(res.reason);
        return true;
      }
      await refreshFiche(thread, sale.id, guildId);
      await applyCasierEffects(client, {
        threadId: res.data.threadId,
        casierForumId: res.data.casierForumId,
        status: SaleStatus.VALIDEE,
        message: `✅ Vente **${res.data.reference}** validee. Quantite validee : ${res.data.validatedQuantity}. Salaire : ${res.data.salaryAmount} $.`,
      });
      scheduleDashboardUpdate(client, config.id);
      await interaction.editReply(
        `Vente ${res.data.reference} validee (salaire ${res.data.salaryAmount} $).`,
      );
      return true;
    }

    case SaleModalId.REFUSE: {
      const reason = interaction.fields.getTextInputValue(SaleFieldId.REASON).trim();
      if (!reason) {
        await interaction.editReply('Motif obligatoire.');
        return true;
      }
      const res = await refuseSale(sale.id, actorId, reason, correlationId);
      if (!res.ok) {
        await interaction.editReply(res.reason);
        return true;
      }
      await refreshFiche(thread, sale.id, guildId);
      await applyCasierEffects(client, {
        threadId: res.data.threadId,
        casierForumId: res.data.casierForumId,
        status: SaleStatus.REFUSEE,
        message: `❌ Vente **${res.data.reference}** refusee.\nMotif : ${reason}`,
      });
      await interaction.editReply(`Vente ${res.data.reference} refusee.`);
      return true;
    }

    case SaleModalId.COMPLEMENT: {
      const reason = interaction.fields.getTextInputValue(SaleFieldId.REASON).trim();
      if (!reason) {
        await interaction.editReply('Indique les elements demandes.');
        return true;
      }
      const res = await requestComplement(sale.id, actorId, reason, correlationId);
      if (!res.ok) {
        await interaction.editReply(res.reason);
        return true;
      }
      await refreshFiche(thread, sale.id, guildId);
      await applyCasierEffects(client, {
        threadId: res.data.threadId,
        casierForumId: res.data.casierForumId,
        status: SaleStatus.INCOMPLETE,
        message: `⚠️ Complement demande — statut : A completer.\n${reason}`,
      });
      await interaction.editReply(`Complement demande pour ${res.data.reference}.`);
      return true;
    }

    case SaleModalId.CORRECT: {
      const newQty = parseQuantityField(interaction.fields.getTextInputValue(SaleFieldId.QUANTITY));
      const reason = interaction.fields.getTextInputValue(SaleFieldId.REASON).trim();
      if (newQty === null) {
        await interaction.editReply('Nouvelle quantite invalide.');
        return true;
      }
      if (!reason) {
        await interaction.editReply('Motif de correction obligatoire.');
        return true;
      }
      const res = await correctSale({
        saleId: sale.id,
        actorId,
        newQuantity: newQty,
        reason,
        correlationId,
      });
      if (!res.ok) {
        await interaction.editReply(res.reason);
        return true;
      }
      await refreshFiche(thread, sale.id, guildId);
      await applyCasierEffects(client, {
        threadId: res.data.threadId,
        casierForumId: res.data.casierForumId,
        status: SaleStatus.VALIDEE,
        message: `✏️ Quantite validee corrigee : ${res.data.oldQuantity} → ${res.data.newQuantity}.`,
      });
      scheduleDashboardUpdate(client, config.id);
      await interaction.editReply(
        `Correction enregistree (${res.data.oldQuantity} → ${res.data.newQuantity}).`,
      );
      return true;
    }

    default:
      return false;
  }
}
