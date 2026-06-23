import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { isDirectionMember } from '../permissions.js';
import { VitrineFieldId, VitrineModalId } from '../components/ids.js';
import { publishVerification } from '../verification/verificationBoard.js';
import { publishEventBoard } from './vitrineBoards.js';

/** Soumission d'un texte public : enregistre et republie l'embed concerne. */
export async function handleVitrineModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const isReglement = interaction.customId === VitrineModalId.WELCOME;
  const isEvent = interaction.customId === VitrineModalId.EVENT;
  if (!isReglement && !isEvent) return false;

  const ephemeral = MessageFlags.Ephemeral;
  if (!interaction.guild) {
    await interaction.reply({ content: 'Serveur requis.', flags: ephemeral });
    return true;
  }
  const config = await getGuildConfigByGuildId(interaction.guild.id);
  if (!config || !(await isDirectionMember(interaction.guild, interaction.user.id, config))) {
    await interaction.reply({ content: 'Réservé à la direction.', flags: ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: ephemeral });
  const text = interaction.fields.getTextInputValue(VitrineFieldId.TEXT).trim();

  await prisma.guildConfig.update({
    where: { id: config.id },
    data: isReglement ? { welcomeBoardText: text } : { eventText: text },
  });
  await writeAudit(prisma, {
    guildConfigId: config.id,
    action: isReglement ? 'REGLEMENT_TEXT_SET' : 'VITRINE_EVENT_SET',
    authorDiscordId: interaction.user.id,
  });

  const channelField = isReglement ? config.channelReglement : config.channelEvent;
  if (isReglement) await publishVerification(interaction.client, config.id);
  else await publishEventBoard(interaction.client, config.id);

  await interaction.editReply(
    channelField
      ? '✅ Texte mis à jour et publié.'
      : `✅ Texte enregistré. ⚠️ Aucun salon lié — \`/config salons ${isReglement ? 'reglement' : 'evenement'}:#…\` pour l’afficher.`,
  );
  return true;
}
