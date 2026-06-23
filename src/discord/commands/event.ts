import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import {
  cancelEvent,
  createEvent,
  listUpcomingEvents,
} from '../../modules/events/eventService.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

/** Parse "JJ/MM/AAAA" + "HH:MM" (ou "20h30") en Date (heure locale serveur). */
function parseDateTime(dateStr: string, heureStr: string | null): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr.trim());
  if (!m) return null;
  let hh = 0;
  let mm = 0;
  if (heureStr && heureStr.trim()) {
    const t = /^(\d{1,2})[:hH](\d{2})$/.exec(heureStr.trim());
    if (!t) return null;
    hh = Number(t[1]);
    mm = Number(t[2]);
    if (hh > 23 || mm > 59) return null;
  }
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), hh, mm);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const eventCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Événements RP (expo, soirée…) dans le planning (direction)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('creer')
        .setDescription('Créer un événement (apparaît dans le planning)')
        .addStringOption((o) => o.setName('titre').setDescription('Titre de l’événement').setRequired(true))
        .addStringOption((o) =>
          o.setName('date').setDescription('Date JJ/MM/AAAA (ex: 25/06/2026)').setRequired(true),
        )
        .addStringOption((o) => o.setName('heure').setDescription('Heure HH:MM (ex: 20:30)'))
        .addStringOption((o) => o.setName('lieu').setDescription('Lieu (ex: Parking TaxiRevo)'))
        .addStringOption((o) =>
          o.setName('role').setDescription('Notre rôle sur place (ex: exposant + tombola)'),
        )
        .addStringOption((o) => o.setName('description').setDescription('Détails / programme')),
    )
    .addSubcommand((s) => s.setName('voir').setDescription('Lister les événements à venir'))
    .addSubcommand((s) =>
      s
        .setName('annuler')
        .setDescription('Annuler un événement')
        .addStringOption((o) =>
          o.setName('evenement').setDescription('Événement').setAutocomplete(true).setRequired(true),
        ),
    )
    .toJSON(),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (!interaction.inGuild()) return void interaction.respond([]);
    const config = await getGuildConfigByGuildId(interaction.guildId);
    if (!config) return void interaction.respond([]);
    const focused = interaction.options.getFocused().toString().toLowerCase();
    const events = await listUpcomingEvents(config.id);
    await interaction.respond(
      events
        .filter((e) => e.title.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((e) => ({
          name: `${e.title} — ${e.startAt.toLocaleDateString('fr-FR')}`.slice(0, 100),
          value: e.id,
        })),
    );
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({ content: 'Serveur requis.', flags: MessageFlags.Ephemeral });
      return;
    }
    const config = await getGuildConfigByGuildId(interaction.guild.id);
    if (!config) {
      await interaction.reply({ content: 'Configuration absente.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!(await isDirection(interaction, config))) {
      await interaction.reply({ content: 'Réservé à la direction.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();

    if (sub === 'creer') {
      const titre = interaction.options.getString('titre', true).trim();
      const dateStr = interaction.options.getString('date', true);
      const heure = interaction.options.getString('heure');
      const startAt = parseDateTime(dateStr, heure);
      if (!startAt) {
        await interaction.editReply('Date/heure invalide. Format : `date:25/06/2026 heure:20:30`.');
        return;
      }
      const res = await createEvent({
        guildConfigId: config.id,
        title: titre,
        startAt,
        location: interaction.options.getString('lieu')?.trim() || null,
        ourRole: interaction.options.getString('role')?.trim() || null,
        description: interaction.options.getString('description')?.trim() || null,
        createdByDiscordId: interaction.user.id,
      });
      if (!res.ok) {
        await interaction.editReply(`Échec : ${res.reason}`);
        return;
      }
      scheduleDashboardUpdate(interaction.client, config.id);
      await interaction.editReply(
        `📅 Événement **${res.data.title}** créé pour le ${startAt.toLocaleString('fr-FR', { timeZone: config.timezone, dateStyle: 'full', timeStyle: 'short' })}. Il apparaît dans le **planning**.`,
      );
      return;
    }

    if (sub === 'voir') {
      const events = await listUpcomingEvents(config.id);
      const body =
        events.length === 0
          ? '_Aucun événement à venir._'
          : events
              .map(
                (e) =>
                  `📅 **${e.title}** — ${e.startAt.toLocaleString('fr-FR', { timeZone: config.timezone, dateStyle: 'short', timeStyle: 'short' })}` +
                  (e.location ? ` · 📍 ${e.location}` : '') +
                  (e.signups.length > 0 ? `\n✋ ${e.signups.join(', ')}` : ''),
              )
              .join('\n\n');
      await interaction.editReply({
        embeds: [new EmbedBuilder().setTitle('Événements à venir').setColor(0x9b59b6).setDescription(body)],
      });
      return;
    }

    // annuler
    const eventId = interaction.options.getString('evenement', true);
    const res = await cancelEvent(config.id, eventId);
    if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
    await interaction.editReply(
      res.ok ? `🚫 Événement **${res.data.title}** annulé.` : `Échec : ${res.reason}`,
    );
  },
};
