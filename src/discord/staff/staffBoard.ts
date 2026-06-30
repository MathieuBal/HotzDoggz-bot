import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type BaseMessageOptions,
  type Client,
  type Guild,
  type TextBasedChannel,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { getStaffRoster, type StaffRosterEntry } from '../../modules/employees/staffService.js';
import { StaffSelectId } from '../components/ids.js';

/**
 * Trombinoscope permanent du salon « Gestion des employes » (direction). Liste
 * l'effectif avec presence + grade lus en direct, signale les anomalies, et
 * porte un menu pour ouvrir la carte detaillee (et editable) d'un employe.
 * Le bot edite toujours le meme message (msgStaffBoard).
 */

const DESC_MAX = 3500;

function rosterLine(e: StaffRosterEntry): string {
  const dot = !e.onServer ? '⚠️' : '🟢';
  const grade = e.gradeLabel ?? 'sans grade';
  const bracelet = e.multiplier > 1 ? ` · ×${e.multiplier}` : '';
  const flags: string[] = [];
  if (!e.onServer) flags.push('parti');
  if (e.ambiguous) flags.push('grade ambigu');
  else if (e.missingGrade) flags.push('sans grade');
  const flagTxt = flags.length ? ` — ⚠️ ${flags.join(', ')}` : '';
  return `${dot} **${e.nomRP}** · ${grade}${bracelet}${flagTxt}`;
}

export async function buildStaffBoardMessage(
  guild: Guild,
  guildConfigId: string,
): Promise<BaseMessageOptions> {
  const roster = await getStaffRoster(guild, guildConfigId);
  const total = roster.active.length + roster.archived.length;

  const embed = new EmbedBuilder()
    .setTitle('🗂️ Gestion des employés')
    .setColor(roster.anomalies.length ? 0xe67e22 : 0xff7a00)
    .setTimestamp(new Date());

  const header =
    `🟢 **${roster.active.length}** actif(s) · 📁 **${roster.archived.length}** archivé(s) · ` +
    `⚠️ **${roster.anomalies.length}** anomalie(s)`;

  if (total === 0) {
    embed.setDescription(
      `${header}\n\nAucun employé enregistré. Associe-les avec \`/employe associer\`.`,
    );
    return { embeds: [embed], components: [] };
  }

  let body = roster.active.map(rosterLine).join('\n');
  if (body.length > DESC_MAX) body = `${body.slice(0, DESC_MAX)}\n…`;
  embed.setDescription(
    `${header}\n\n**Effectif actif**\n${body || '_Aucun employé actif._'}`,
  );

  if (roster.archived.length) {
    const arch = roster.archived.map((e) => `📁 ${e.nomRP}`).join(' · ');
    embed.addFields({ name: `Archivés (${roster.archived.length})`, value: arch.slice(0, 1024) });
  }
  if (roster.anomalies.length) {
    const an = roster.anomalies.map((a) => `• ${a.detail}`).join('\n');
    embed.addFields({ name: `⚠️ Anomalies (${roster.anomalies.length})`, value: an.slice(0, 1024) });
  }
  if (!roster.membersResolved) {
    embed.addFields({
      name: 'ℹ️ Présences',
      value:
        'Liste des membres indisponible (intent GuildMembers ?) — présence et anomalies partielles.',
    });
  }

  // Menu d'ouverture de carte : actifs d'abord, puis archives (cap Discord 25).
  const ordered = [...roster.active, ...roster.archived];
  const shown = ordered.slice(0, 25);
  const options = shown.map((e) => ({
    label: `${e.active ? '' : '📁 '}${e.nomRP}`.slice(0, 100),
    value: e.employeeId,
    description: `${e.gradeLabel ?? 'sans grade'}${e.onServer ? '' : ' · a quitté'}`.slice(0, 100),
  }));

  const truncated = ordered.length > shown.length;
  embed.setFooter({
    text: truncated
      ? `Menu limité à 25 — pour les autres, utilise /staff membre:@…`
      : 'Sélectionne un employé pour ouvrir sa carte et la modifier.',
  });

  const components = options.length
    ? [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(StaffSelectId.OPEN)
            .setPlaceholder('👤 Ouvrir la carte d’un employé…')
            .addOptions(options),
        ),
      ]
    : [];

  return { embeds: [embed], components };
}

/** Publie / met a jour le trombinoscope permanent dans le salon gestion. */
export async function publishStaffBoard(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelStaff) return;

  const channel = await client.channels.fetch(config.channelStaff).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel) || !('guild' in channel)) {
    logger.warn({ channelId: config.channelStaff }, 'Salon gestion employés introuvable ou non textuel');
    return;
  }
  const guild = channel.guild;
  const payload = await buildStaffBoardMessage(guild, guildConfigId);

  if (config.msgStaffBoard) {
    try {
      const msg = await (channel as TextBasedChannel).messages.fetch(config.msgStaffBoard);
      await msg.edit(payload);
      return;
    } catch {
      logger.warn({ msgStaffBoard: config.msgStaffBoard }, 'Trombinoscope absent — recreation');
    }
  }
  const created = await channel.send(payload);
  await prisma.guildConfig.update({
    where: { id: guildConfigId },
    data: { msgStaffBoard: created.id },
  });
}
