import { EmbedBuilder, Events, type Client, type GuildMember } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { renderWelcomeMessage } from '../../modules/welcome/welcomeMessage.js';

/**
 * Accueil des nouveaux arrivants : a chaque membre qui rejoint le serveur, le
 * bot poste un message de bienvenue (mention + avatar + texte RP) dans le salon
 * d'accueil configure. Sans salon configure, l'event est ignore.
 */
export function registerGuildMemberAdd(client: Client): void {
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    if (member.user.bot) return; // on n'accueille pas les bots

    const config = await prisma.guildConfig.findUnique({
      where: { guildId: member.guild.id },
      select: { channelWelcome: true, welcomeMessage: true },
    });
    if (!config?.channelWelcome) return;

    const channel = await member.guild.channels.fetch(config.channelWelcome).catch(() => null);
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      logger.warn({ channelId: config.channelWelcome }, 'Salon d’accueil introuvable ou non textuel');
      return;
    }

    const text = renderWelcomeMessage(config.welcomeMessage, {
      mention: `<@${member.id}>`,
      guildName: member.guild.name,
    });

    const embed = new EmbedBuilder()
      .setColor(0xff7a00)
      .setTitle('👋 Un nouveau client arrive !')
      .setDescription(text)
      .setThumbnail(member.displayAvatarURL({ size: 256 }))
      .setFooter({ text: `${member.guild.memberCount} membres` })
      .setTimestamp(new Date());

    try {
      // La mention dans `content` ping reellement le nouvel arrivant.
      await channel.send({ content: `<@${member.id}>`, embeds: [embed] });
    } catch (err) {
      logger.warn({ err, channelId: config.channelWelcome }, 'Envoi du message d’accueil KO');
    }
  });
}
