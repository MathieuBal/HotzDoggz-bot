import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { isDirectionMember } from '../permissions.js';
import { VitrineFieldId, VitrineModalId } from '../components/ids.js';
import { publishEventBoard, publishWelcomeBoard } from './vitrineBoards.js';

/** Soumission d'une vitrine : enregistre le texte et republie l'embed. */
export async function handleVitrineModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const isWelcome = interaction.customId === VitrineModalId.WELCOME;
  const isEvent = interaction.customId === VitrineModalId.EVENT;
  if (!isWelcome && !isEvent) return false;

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
    data: isWelcome ? { welcomeBoardText: text } : { eventText: text },
  });
  await writeAudit(prisma, {
    guildConfigId: config.id,
    action: isWelcome ? 'VITRINE_WELCOME_SET' : 'VITRINE_EVENT_SET',
    authorDiscordId: interaction.user.id,
  });

  const channelField = isWelcome ? config.channelWelcome : config.channelEvent;
  if (isWelcome) await publishWelcomeBoard(interaction.client, config.id);
  else await publishEventBoard(interaction.client, config.id);

  await interaction.editReply(
    channelField
      ? '✅ Vitrine mise à jour et publiée.'
      : `✅ Texte enregistré. ⚠️ Aucun salon lié — \`/config salons ${isWelcome ? 'accueil' : 'evenement'}:#…\` pour l’afficher.`,
  );
  return true;
}
