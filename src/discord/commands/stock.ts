import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import {
  getEmployeeByDiscordId,
  getGuildConfigByGuildId,
} from '../../modules/employees/employeeService.js';
import {
  consumeHotdogs,
  listVehicles,
  setSaucisses,
  transformToHotdogs,
} from '../../modules/stock/stockService.js';
import { buildStockEmbed } from '../stock/stockBoard.js';
import { formatCountdown } from '../../modules/stock/perishable.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

export const stockCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Stock de saucisses & hot dogs (production en 2 temps)')
    .addSubcommand((s) =>
      s
        .setName('saucisses')
        .setDescription('Définir le stock de saucisses d’un véhicule (total vu dans le coffre)')
        .addStringOption((o) =>
          o.setName('vehicule').setDescription('Véhicule').setAutocomplete(true).setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName('quantite').setDescription('Total de saucisses dans le coffre').setMinValue(0).setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('transformer')
        .setDescription('Transformer des saucisses en hot dogs (1:1)')
        .addStringOption((o) =>
          o.setName('vehicule').setDescription('Véhicule source').setAutocomplete(true).setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName('quantite').setDescription('Nombre à transformer').setMinValue(1).setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('sortir')
        .setDescription('Sortir des hot dogs du stock (vendus/utilisés) — direction')
        .addIntegerOption((o) =>
          o.setName('quantite').setDescription('Nombre de hot dogs').setMinValue(1).setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName('voir').setDescription('État du stock (saucisses + hot dogs)'))
    .toJSON(),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (!interaction.inGuild()) return void interaction.respond([]);
    const config = await getGuildConfigByGuildId(interaction.guildId);
    if (!config) return void interaction.respond([]);
    const focused = interaction.options.getFocused().toString().toLowerCase();
    const vehicles = await listVehicles(config.id);
    await interaction.respond(
      vehicles
        .filter((v) => `${v.make} ${v.plate} ${v.name ?? ''}`.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((v) => ({
          name: `${v.name ? `${v.name} — ` : ''}${v.make} ${v.plate} (${v.saucisses} saucisses)`.slice(0, 100),
          value: v.id,
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

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();

    if (sub === 'voir') {
      await interaction.editReply({ embeds: [await buildStockEmbed(config.id)] });
      return;
    }

    // Actions : employe actif requis (la direction l'est aussi via son grade).
    const employee = await getEmployeeByDiscordId(interaction.user.id);
    const isStaff = employee && employee.guildConfigId === config.id && employee.status === 'ACTIVE';
    if (!isStaff && !(await isDirection(interaction, config))) {
      await interaction.editReply('Réservé aux employés actifs.');
      return;
    }

    if (sub === 'saucisses') {
      const res = await setSaucisses(
        config.id,
        interaction.options.getString('vehicule', true),
        interaction.options.getInteger('quantite', true),
        interaction.user.id,
      );
      if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
      await interaction.editReply(
        res.ok
          ? `📦 Stock du **${res.data.vehicle.make} ${res.data.vehicle.plate}** mis à jour : **${res.data.vehicle.saucisses}** saucisse(s) _(avant : ${res.data.previous})_.`
          : `Échec : ${res.reason}`,
      );
      return;
    }

    if (sub === 'transformer') {
      const qty = interaction.options.getInteger('quantite', true);
      const res = await transformToHotdogs(
        config.id,
        interaction.options.getString('vehicule', true),
        qty,
        interaction.user.id,
      );
      if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
      await interaction.editReply(
        res.ok
          ? `🌭 ${qty} hot dog(s) produit(s) ! ⏳ Périment dans **${formatCountdown(res.data.expiresAt)}**. Saucisses restantes : ${res.data.vehicle.saucisses}.`
          : `Échec : ${res.reason}`,
      );
      return;
    }

    // sortir (direction)
    if (!(await isDirection(interaction, config))) {
      await interaction.editReply('La sortie de stock est réservée à la direction.');
      return;
    }
    const res = await consumeHotdogs(
      config.id,
      interaction.options.getInteger('quantite', true),
      interaction.user.id,
    );
    if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
    await interaction.editReply(
      res.ok ? `📤 ${res.data.consumed} hot dog(s) sortis du stock.` : `Échec : ${res.reason}`,
    );
  },
};
