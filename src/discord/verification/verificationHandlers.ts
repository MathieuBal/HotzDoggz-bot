import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { VerificationButtonId, VerificationFieldId, VerificationModalId } from '../components/ids.js';

/** Bouton « J'accepte le reglement » -> ouvre le formulaire nom RP. */
export async function handleVerificationButton(interaction: ButtonInteraction): Promise<boolean> {
  if (interaction.customId !== VerificationButtonId.ACCEPT) return false;

  const modal = new ModalBuilder()
    .setCustomId(VerificationModalId.SUBMIT)
    .setTitle('Bienvenue ! Ton nom RP')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(VerificationFieldId.NOM_RP)
          .setLabel('Ton nom RP (deviendra ton pseudo)')
          .setStyle(TextInputStyle.Short)
          .setMinLength(2)
          .setMaxLength(32)
          .setRequired(true),
      ),
    );
  await interaction.showModal(modal);
  return true;
}

/** Soumission du formulaire : attribue le role Client + renomme le visiteur. */
export async function handleVerificationModal(
  interaction: ModalSubmitInteraction,
): Promise<boolean> {
  if (interaction.customId !== VerificationModalId.SUBMIT) return false;

  const ephemeral = MessageFlags.Ephemeral;
  if (!interaction.guild) {
    await interaction.reply({ content: 'Serveur requis.', flags: ephemeral });
    return true;
  }
  await interaction.deferReply({ flags: ephemeral });

  const config = await prisma.guildConfig.findUnique({
    where: { guildId: interaction.guild.id },
    select: { id: true, roleClient: true },
  });
  if (!config?.roleClient) {
    await interaction.editReply(
      'L’accès n’est pas encore configuré (rôle Client manquant). Préviens la direction.',
    );
    return true;
  }

  const nomRP = interaction.fields.getTextInputValue(VerificationFieldId.NOM_RP).trim();
  if (!nomRP) {
    await interaction.editReply('Nom RP vide. Réessaie.');
    return true;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.editReply('Membre introuvable. Réessaie.');
    return true;
  }

  // Attribution du role (bloquant : c'est le coeur de l'acces).
  try {
    await member.roles.add(config.roleClient);
  } catch (err) {
    logger.error({ err, roleId: config.roleClient }, 'Attribution role Client KO');
    await interaction.editReply(
      'Impossible de t’attribuer l’accès (le rôle du bot doit être au-dessus du rôle Client). ' +
        'Préviens la direction.',
    );
    return true;
  }

  // Renommage (non bloquant : le proprietaire du serveur ne peut pas etre renomme).
  let renameNote = '';
  try {
    await member.setNickname(nomRP);
  } catch {
    renameNote = '\n_(Je n’ai pas pu changer ton pseudo — fais-le toi-même si tu veux.)_';
  }

  await writeAudit(prisma, {
    guildConfigId: config.id,
    action: 'CLIENT_VERIFIED',
    authorDiscordId: interaction.user.id,
    after: { nomRP },
  });

  await interaction.editReply(
    `✅ Bienvenue **${nomRP}** ! Tu as maintenant accès au menu, aux tarifs et aux commandes. ` +
      `Bon appétit ! 🌭${renameNote}`,
  );
  logger.info({ userId: interaction.user.id, nomRP }, 'Visiteur verifie -> Client');
  return true;
}
