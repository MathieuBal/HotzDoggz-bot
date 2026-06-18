import { MessageFlags, type ButtonInteraction, type ThreadChannel } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../infrastructure/database/client.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { takeCharge } from '../../modules/verification/verificationService.js';
import { SaleButtonId } from '../components/ids.js';
import { isDirectionMember } from '../permissions.js';
import {
  buildComplementModal,
  buildCorrectModal,
  buildRefuseModal,
  buildValidateModal,
} from '../modals/saleModals.js';
import { refreshFiche } from '../verification/ficheHelpers.js';

const KNOWN = new Set<string>(Object.values(SaleButtonId));

/** @returns true si l'interaction a ete prise en charge ici. */
export async function handleSaleButton(interaction: ButtonInteraction): Promise<boolean> {
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
  });
  if (!sale) {
    await interaction.reply({ content: 'Fiche de controle non reconnue.', flags: ephemeral });
    return true;
  }

  switch (interaction.customId) {
    case SaleButtonId.COMPLEMENT:
      await interaction.showModal(buildComplementModal(sale.reference));
      return true;
    case SaleButtonId.VALIDATE:
      await interaction.showModal(buildValidateModal(sale.reference, sale.declaredQuantity));
      return true;
    case SaleButtonId.REFUSE:
      await interaction.showModal(buildRefuseModal(sale.reference));
      return true;
    case SaleButtonId.CORRECT:
      await interaction.showModal(
        buildCorrectModal(sale.reference, sale.validatedQuantity ?? sale.declaredQuantity),
      );
      return true;
    case SaleButtonId.TAKE: {
      await interaction.deferReply({ flags: ephemeral });
      const result = await takeCharge(sale.id, interaction.user.id, randomUUID());
      if (!result.ok) {
        await interaction.editReply(result.reason);
        return true;
      }
      await refreshFiche(interaction.channel as ThreadChannel, sale.id, interaction.guild.id);
      const msg = result.data.alreadyControlledBy
        ? `Deja pris en charge par <@${result.data.alreadyControlledBy}>.`
        : `Tu prends en charge ${sale.reference}.`;
      await interaction.editReply(msg);
      return true;
    }
    default:
      return false;
  }
}
