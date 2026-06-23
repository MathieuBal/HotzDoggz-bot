import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { AttachmentType } from '@prisma/client';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import {
  getEmployeeByDiscordId,
  getGuildConfigByGuildId,
} from '../../modules/employees/employeeService.js';
import { createVehicle } from '../../modules/garage/garageService.js';
import { listVehicles, removeVehicle } from '../../modules/stock/stockService.js';
import { downloadAndStore, isImageAttachment } from '../../modules/sales/attachments.js';
import { isDirection, isDirectionMember } from '../permissions.js';
import type { SlashCommand } from './types.js';

export const vehiculeCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('vehicule')
    .setDescription('Gérer les véhicules de stock (direction)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('ajouter')
        .setDescription('Enregistrer un véhicule au garage (photo + capacité)')
        .addStringOption((o) => o.setName('marque').setDescription('Marque du véhicule').setRequired(true))
        .addStringOption((o) => o.setName('plaque').setDescription('Plaque d’immatriculation').setRequired(true))
        .addAttachmentOption((o) => o.setName('photo').setDescription('Photo du véhicule').setRequired(true))
        .addIntegerOption((o) =>
          o.setName('poids').setDescription('Poids transportable (capacité)').setMinValue(0).setRequired(true),
        )
        .addUserOption((o) =>
          o.setName('proprietaire').setDescription('Employé à qui l’attribuer (sinon : disponible)'),
        )
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
      const photo = interaction.options.getAttachment('photo', true);
      if (!isImageAttachment(photo)) {
        await interaction.editReply('La photo doit être une image.');
        return;
      }
      // Proprietaire optionnel : doit etre un employe actif. Sinon : disponible.
      let ownerId: string | null = null;
      let ownerIsDirection = false;
      const proprio = interaction.options.getUser('proprietaire');
      if (proprio) {
        const emp = await getEmployeeByDiscordId(proprio.id);
        if (!emp || emp.guildConfigId !== config.id || emp.status !== 'ACTIVE') {
          await interaction.editReply('Le propriétaire doit être un employé actif.');
          return;
        }
        ownerId = emp.id;
        ownerIsDirection = await isDirectionMember(interaction.guild, proprio.id, config);
      }
      let stored;
      try {
        stored = await downloadAndStore({
          guildId: interaction.guild.id,
          threadId: `vehicle-${interaction.id}`,
          type: AttachmentType.COFFRE_PLEIN, // emplacement de stockage (photo vehicule)
          messageId: interaction.id,
          attachment: photo,
        });
      } catch {
        await interaction.editReply('Échec de la copie de la photo. Réessaie.');
        return;
      }
      const res = await createVehicle({
        guildConfigId: config.id,
        make: interaction.options.getString('marque', true),
        plate: interaction.options.getString('plaque', true),
        name: interaction.options.getString('nom')?.trim() || null,
        capacity: interaction.options.getInteger('poids', true),
        photoKey: stored.storageKey,
        photoName: stored.fileName,
        ownerId,
        ownerIsDirection,
        byDiscordId: interaction.user.id,
      });
      if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
      await interaction.editReply(
        res.ok
          ? `🚚 Véhicule **${res.data.make} ${res.data.plate}** enregistré` +
              (res.data.ownerNomRP ? ` → attribué à **${res.data.ownerNomRP}**.` : ' (disponible à donner).')
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
