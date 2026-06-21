import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type Guild,
  type TextBasedChannel,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { VerificationButtonId } from '../components/ids.js';

const SIGNATURE = 'HotzDoggz – Le goût qui fait la différence 🔥';

/** Texte du reglement / accueil (corps editable, hors titre & appel a l'action). */
export const DEFAULT_REGLEMENT_TEXT =
  'Toute l’équipe vous souhaite la bienvenue dans notre univers dédié aux **meilleurs hot dogs de la ville** !\n\n' +
  '🚂 **HotzDoggz, c’est :**\n' +
  '• Des menus uniques et savoureux.\n' +
  '• Des événements et offres exclusives.\n' +
  '• Un service sur place et en livraison.\n' +
  '• Une communauté conviviale et respectueuse.\n\n' +
  '🤝 **Respect, bonne humeur et partage** sont les maîtres mots de ce serveur.\n' +
  'Merci pour votre confiance — nous espérons vous régaler très bientôt ! 🌭';

const CALL_TO_ACTION =
  '\n\n━━━━━━━━━━━━━━━\n' +
  '✅ **En cliquant ci-dessous**, tu confirmes avoir lu et accepté le règlement.\n' +
  'On te demandera ton **nom RP** (ton futur pseudo) ; tu auras ensuite accès au ' +
  '**menu**, aux **tarifs** et aux **commandes**.';

/**
 * Sas d'entree : un message permanent dans le salon reglement, avec le texte
 * du reglement (editable via /vitrine reglement) + un bouton « J'accepte ».
 * Le clic ouvre un formulaire (nom RP) puis attribue le role Client et renomme
 * le visiteur. Le bot ne gere PAS les permissions des salons : c'est le role
 * Client qui debloque l'acces (configure une fois cote Discord).
 */
export function buildVerificationMessage(
  guild: Guild,
  body: string | null,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const text = (body && body.trim() ? body : DEFAULT_REGLEMENT_TEXT) + CALL_TO_ACTION;
  const embed = new EmbedBuilder()
    .setColor(0xff7a00)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
    .setTitle('📜 Règlement & accès au serveur')
    .setDescription(text.slice(0, 4096))
    .setFooter({ text: SIGNATURE });
  const icon = guild.iconURL({ size: 256 });
  if (icon) embed.setThumbnail(icon);

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
  if (!channel || !channel.isTextBased() || !('send' in channel) || !('guild' in channel)) {
    logger.warn({ channelId: config.channelReglement }, 'Salon reglement introuvable');
    return;
  }
  const payload = buildVerificationMessage(channel.guild, config.welcomeBoardText);

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
