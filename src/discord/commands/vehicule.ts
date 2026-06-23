import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { addVehicle, listVehicles, removeVehicle } from '../../modules/stock/stockService.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

export const vehiculeCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('vehicule')
    .setDescription('Gérer les véhicules de stock (direction)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('ajouter')
        .setDescription('Enregistrer un véhicule (marque + plaque)')
        .addStringOption((o) => o.setName('marque').setDescription('Marque du véhicule').setRequired(true))
        .addStringOption((o) => o.setName('plaque').setDescription('Plaque d’immatriculation').setRequired(true))
        .addStringOption((o) => o.setName('nom').setDescription('Petit nom (optionnel)')),
    )
    .addSubcommand((s) =>
      s
        .setName('retirer')
        .setDescription('Retirer un véhicule')
        .addStringOption((o) =>
          o.setName('vehicule').setDescription('Véhicule').setAutocomplete(true).setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName('voir').setDescription('Lister les véhicules et leur stock'))
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
        .map((v) => ({ name: `${v.name ? `${v.name} — ` : ''}${v.make} ${v.plate}`.slice(0, 100), value: v.id })),
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

    if (sub === 'ajouter') {
      const res = await addVehicle(
        config.id,
        interaction.options.getString('marque', true),
        interaction.options.getString('plaque', true),
        interaction.options.getString('nom')?.trim() || null,
        interaction.user.id,
      );
      if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
      await interaction.editReply(
        res.ok
          ? `🚚 Véhicule **${res.data.make} ${res.data.plate}** enregistré.`
          : `Échec : ${res.reason}`,
      );
      return;
    }

    if (sub === 'retirer') {
      const res = await removeVehicle(config.id, interaction.options.getString('vehicule', true));
      if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
      await interaction.editReply(
        res.ok ? `🚫 Véhicule **${res.data.plate}** retiré.` : `Échec : ${res.reason}`,
      );
      return;
    }

    // voir
    const vehicles = await listVehicles(config.id);
    const body =
      vehicles.length === 0
        ? '_Aucun véhicule. Ajoute-en un avec `/vehicule ajouter`._'
        : vehicles
            .map((v) => `🚚 **${v.make} ${v.plate}**${v.name ? ` (${v.name})` : ''} — ${v.saucisses} saucisse(s)`)
            .join('\n');
    await interaction.editReply({
      embeds: [new EmbedBuilder().setTitle('Véhicules').setColor(0x34495e).setDescription(body)],
    });
  },
};
