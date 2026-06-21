import {
  EmbedBuilder,
  type Client,
  type Guild,
  type TextBasedChannel,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';

const SIGNATURE = 'HotzDoggz – Le goût qui fait la différence 🔥';

/** Texte par defaut de la vitrine evenement. */
export const DEFAULT_EVENT_BOARD =
  'L’heure est enfin arrivée ! 🎉\n\n' +
  'Pour célébrer l’ouverture officielle de **HotzDoggz**, nous préparons un événement ' +
  'exceptionnel avec de nombreuses surprises pour tous nos clients !\n\n' +
  '🎁 Cadeaux à gagner\n' +
  '💰 Promotions exclusives\n' +
  '🌭 Menus à prix réduits\n' +
  '🎊 Animations et bonne ambiance\n\n' +
  'C’est l’occasion parfaite de découvrir nos spécialités, profiter des offres de lancement ' +
  'et partager un bon moment avec la communauté.\n\n' +
  '📅 **Date et heure** annoncées prochainement.\n' +
  '📍 Sur place et possibilités de livraison.\n\n' +
  'Restez connectés, les informations arrivent très bientôt…';

function styled(guild: Guild, opts: { title: string; body: string; color: number }): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(opts.color)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
    .setTitle(opts.title)
    .setDescription(opts.body)
    .setFooter({ text: SIGNATURE });
  const icon = guild.iconURL({ size: 256 });
  if (icon) embed.setThumbnail(icon);
  return embed;
}

export function buildEventBoardEmbed(guild: Guild, body: string | null): EmbedBuilder {
  return styled(guild, {
    title: '🌭🚂 ÉVÉNEMENT D’OUVERTURE HOTZDOGGZ 🚂🌭',
    body: body && body.trim() ? body : DEFAULT_EVENT_BOARD,
    color: 0xe74c3c,
  });
}

interface BoardSpec {
  channelField: 'channelEvent';
  msgField: 'msgEventBoard';
  build: (guild: Guild, body: string | null) => EmbedBuilder;
  textField: 'eventText';
}

async function publishBoard(client: Client, guildConfigId: string, spec: BoardSpec): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  const channelId = config?.[spec.channelField];
  if (!config || !channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel) || !('guild' in channel)) {
    logger.warn({ channelId }, 'Salon vitrine introuvable');
    return;
  }
  const embed = spec.build(channel.guild, config[spec.textField]);
  const existingMsgId = config[spec.msgField];

  if (existingMsgId) {
    try {
      const msg = await (channel as TextBasedChannel).messages.fetch(existingMsgId);
      await msg.edit({ embeds: [embed] });
      return;
    } catch {
      /* message supprime -> on recree */
    }
  }
  const created = await channel.send({ embeds: [embed] });
  await prisma.guildConfig.update({
    where: { id: guildConfigId },
    data: { [spec.msgField]: created.id },
  });
}

export function publishEventBoard(client: Client, guildConfigId: string): Promise<void> {
  return publishBoard(client, guildConfigId, {
    channelField: 'channelEvent',
    msgField: 'msgEventBoard',
    textField: 'eventText',
    build: buildEventBoardEmbed,
  });
}
