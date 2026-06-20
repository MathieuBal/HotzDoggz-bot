import { MessageFlags, type ButtonInteraction, type ThreadChannel } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { takeChargeDirectSale } from '../../modules/directSales/directSaleService.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { DirectSaleButtonId } from '../components/ids.js';
import { refreshDirectFiche } from '../directSales/fiche.js';
import { buildDirectRefuseModal, buildDirectValidateModal } from '../modals/directSaleModals.js';
import { isDirectionMember } from '../permissions.js';

const KNOWN = new Set<string>(Object.values(DirectSaleButtonId));

/** @returns true si l'interaction a ete prise en charge ici. */
export async function handleDirectSaleButton(interaction: ButtonInteraction): Promise<boolean> {
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
    include: { lines: true },
  });
  if (!sale) {
    await interaction.reply({ content: 'Fiche non reconnue.', flags: ephemeral });
    return true;
  }

  switch (interaction.customId) {
    case DirectSaleButtonId.VALIDATE:
      await interaction.showModal(buildDirectValidateModal(sale.reference, sale.lines));
      return true;
    case DirectSaleButtonId.REFUSE:
      await interaction.showModal(buildDirectRefuseModal(sale.reference));
      return true;
    case DirectSaleButtonId.TAKE: {
      await interaction.deferReply({ flags: ephemeral });
      const res = await takeChargeDirectSale(sale.id, interaction.user.id);
      if (!res.ok) {
        await interaction.editReply(res.reason);
        return true;
      }
      await refreshDirectFiche(interaction.channel as ThreadChannel, sale.id);
      await interaction.editReply(`Tu prends en charge ${sale.reference}.`);
      return true;
    }
    default:
      return false;
  }
}
