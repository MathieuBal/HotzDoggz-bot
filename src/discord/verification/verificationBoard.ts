import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type TextBasedChannel,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { VerificationButtonId } from '../components/ids.js';

/**
 * Sas d'entree : un message permanent dans le salon reglement, avec un bouton
 * « J'accepte le reglement ». Le clic ouvre un formulaire (nom RP) puis attribue
 * le role Client et renomme le visiteur. Le bot ne gere PAS les permissions des
 * salons : c'est le role Client qui debloque l'acces (configure une fois cote
 * Discord).
 */
export function buildVerificationMessage(): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setColor(0xff7a00)
    .setTitle('✅ Accès au serveur')
    .setDescription(
      'Pour accéder au **menu**, aux **tarifs** et passer **commande**, lis le règlement ' +
        'ci-dessus puis clique sur le bouton. On te demandera ton **nom RP** : il deviendra ' +
        'ton pseudo sur le serveur.',
    )
    .setFooter({ text: 'En cliquant, tu confirmes avoir lu et accepté le règlement.' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(VerificationButtonId.ACCEPT)
      .setLabel('J’accepte le règlement')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

/** Publie / met a jour le message de validation dans le salon reglement. */
export async function publishVerification(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelReglement) return;

  const channel = await client.channels.fetch(config.channelReglement).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    logger.warn({ channelId: config.channelReglement }, 'Salon reglement introuvable');
    return;
  }
  const payload = buildVerificationMessage();

  if (config.msgVerification) {
    try {
      const msg = await (channel as TextBasedChannel).messages.fetch(config.msgVerification);
      await msg.edit(payload);
      return;
    } catch {
      /* message supprime -> on recree */
    }
  }
  const created = await channel.send(payload);
  await prisma.guildConfig.update({
    where: { id: guildConfigId },
    data: { msgVerification: created.id },
  });
}
