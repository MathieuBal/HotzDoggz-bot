import { EmbedBuilder, type ButtonInteraction } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import { archiveEmployee } from '../../modules/employees/employeeService.js';
import { deactivateProduct, upsertProduct } from '../../modules/products/productService.js';
import { publishMenuBoard } from '../menu/menuBoard.js';
import { PanelConfirmId } from '../components/ids.js';
import { takePending, type PendingAction } from '../panel/pending.js';

function result(text: string, color = 0x2ecc71): { embeds: EmbedBuilder[]; components: never[] } {
  return { embeds: [new EmbedBuilder().setDescription(text).setColor(color)], components: [] };
}

async function apply(
  interaction: ButtonInteraction,
  action: PendingAction,
): Promise<{ embeds: EmbedBuilder[]; components: never[] }> {
  switch (action.kind) {
    case 'menu_price': {
      const res = await upsertProduct(action.guildConfigId, action.name, action.price);
      if (!res.ok) return result(`Échec : ${res.reason}`, 0xc0392b);
      await writeAudit(prisma, {
        guildConfigId: action.guildConfigId,
        action: 'PRODUCT_UPSERT',
        authorDiscordId: interaction.user.id,
        entityType: 'Product',
        entityId: res.data.id,
        before: action.oldPrice === null ? undefined : { retailPrice: action.oldPrice },
        after: { name: res.data.name, retailPrice: res.data.retailPrice },
      });
      scheduleDashboardUpdate(interaction.client, action.guildConfigId);
      await publishMenuBoard(interaction.client, action.guildConfigId).catch(() => undefined);
      const change =
        action.oldPrice === null
          ? 'ajouté au menu'
          : `mis à jour (${action.oldPrice} $ → ${action.price} $)`;
      return result(`✅ **${res.data.name}** ${change} à ${action.price} $.`);
    }
    case 'pnj_price': {
      await prisma.guildConfig.update({
        where: { id: action.guildConfigId },
        data: { pnjUnitPrice: action.price },
      });
      await writeAudit(prisma, {
        guildConfigId: action.guildConfigId,
        action: 'PNJ_PRICE_SET',
        authorDiscordId: interaction.user.id,
        before: { pnjUnitPrice: action.oldPrice },
        after: { pnjUnitPrice: action.price },
      });
      scheduleDashboardUpdate(interaction.client, action.guildConfigId);
      return result(`💵 Prix de vente PNJ : ${action.oldPrice} $ → **${action.price} $/u**.`);
    }
    case 'menu_remove': {
      const res = await deactivateProduct(action.guildConfigId, action.name);
      if (!res.ok) return result(`Échec : ${res.reason}`, 0xc0392b);
      await writeAudit(prisma, {
        guildConfigId: action.guildConfigId,
        action: 'PRODUCT_DEACTIVATED',
        authorDiscordId: interaction.user.id,
        entityType: 'Product',
        entityId: res.data.id,
      });
      scheduleDashboardUpdate(interaction.client, action.guildConfigId);
      await publishMenuBoard(interaction.client, action.guildConfigId).catch(() => undefined);
      return result(`🗑️ **${res.data.name}** retiré du menu.`);
    }
    case 'archive': {
      const existing = await prisma.employee.findUnique({
        where: { discordUserId: action.discordUserId },
        select: { status: true },
      });
      if (!existing) return result('Aucun employé associé à ce membre.', 0xc0392b);
      const employee = await archiveEmployee(action.discordUserId);
      await writeAudit(prisma, {
        guildConfigId: action.guildConfigId,
        action: 'EMPLOYEE_ARCHIVED',
        authorDiscordId: interaction.user.id,
        entityType: 'Employee',
        entityId: employee.id,
        before: { status: existing.status },
        after: { status: 'ARCHIVED' },
      });
      scheduleDashboardUpdate(interaction.client, action.guildConfigId);
      return result(`📦 Employé **${employee.nomRP}** archivé. Historique conservé.`);
    }
  }
}

/** Boutons Confirmer / Annuler des actions critiques. @returns true si gere ici. */
export async function handlePanelConfirmButton(interaction: ButtonInteraction): Promise<boolean> {
  const [prefix, kind, token] = interaction.customId.split(':');
  if (prefix !== 'panel' || (kind !== 'confirm' && kind !== 'cancel') || !token) return false;

  if (`${prefix}:${kind}` === PanelConfirmId.CANCEL) {
    await interaction.update(result('✖️ Action annulée.', 0x95a5a6));
    return true;
  }

  const action = takePending(token, interaction.user.id);
  if (!action) {
    await interaction.update(result('⏳ Confirmation expirée ou déjà traitée. Recommence.', 0xc0392b));
    return true;
  }
  await interaction.update(await apply(interaction, action));
  return true;
}
