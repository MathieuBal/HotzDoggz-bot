import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type UserSelectMenuInteraction,
} from 'discord.js';
import { getObjectStorage } from '../../infrastructure/object-storage/factory.js';
import {
  getEmployeeByDiscordId,
  getGuildConfigByGuildId,
} from '../../modules/employees/employeeService.js';
import { assignVehicle, getVehicleById } from '../../modules/garage/garageService.js';
import { GarageId, StockFieldId, StockModalId } from '../components/ids.js';
import { isDirectionMember } from '../permissions.js';
import { publishGarageBoard } from './garageBoard.js';

const nf = new Intl.NumberFormat('fr-FR');

/** Ouvre la carte d'un vehicule ; si c'est le sien (ou direction), boutons de gestion. */
export async function handleGarageOpen(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (interaction.customId !== GarageId.OPEN) return false;
  const ephemeral = MessageFlags.Ephemeral;
  if (!interaction.guild) {
    await interaction.reply({ content: 'Serveur requis.', flags: ephemeral });
    return true;
  }
  const config = await getGuildConfigByGuildId(interaction.guild.id);
  if (!config) {
    await interaction.reply({ content: 'Configuration absente.', flags: ephemeral });
    return true;
  }
  const vehicleId = interaction.values[0];
  const vehicle = vehicleId ? await getVehicleById(config.id, vehicleId) : null;
  if (!vehicle) {
    await interaction.reply({ content: 'Véhicule introuvable.', flags: ephemeral });
    return true;
  }

  const employee = await getEmployeeByDiscordId(interaction.user.id);
  const isOwner = Boolean(employee && vehicle.ownerId && employee.id === vehicle.ownerId);
  const isDir = await isDirectionMember(interaction.guild, interaction.user.id, config);

  const embed = new EmbedBuilder()
    .setColor(vehicle.ownerId ? 0x34495e : 0x2ecc71)
    .setTitle(`🚗 ${vehicle.name ? `${vehicle.name} — ` : ''}${vehicle.make} ${vehicle.plate}`)
    .addFields(
      { name: 'Propriétaire', value: vehicle.ownerNomRP ? `${vehicle.ownerNomRP}` : '🟢 Disponible', inline: true },
      { name: 'Poids transportable', value: nf.format(vehicle.capacity), inline: true },
      { name: '🥩 Saucisses', value: nf.format(vehicle.saucisses), inline: true },
    );
  const files: AttachmentBuilder[] = [];
  if (vehicle.photoKey) {
    try {
      const bytes = await getObjectStorage().get(vehicle.photoKey);
      const ext = vehicle.photoName?.split('.').pop()?.toLowerCase() ?? 'png';
      const name = `vehicle-${vehicle.id}.${/^[a-z0-9]{1,5}$/.test(ext) ? ext : 'png'}`;
      files.push(new AttachmentBuilder(bytes, { name }));
      embed.setImage(`attachment://${name}`);
    } catch {
      /* photo illisible : on affiche sans */
    }
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (isOwner || isDir) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${GarageId.VEH_RAMASSER}:${vehicle.id}`)
          .setLabel('Ramasser des saucisses')
          .setEmoji('🥩')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${GarageId.VEH_TRANSFORMER}:${vehicle.id}`)
          .setLabel('Transformer en hot dogs')
          .setEmoji('🌭')
          .setStyle(ButtonStyle.Primary),
      ),
    );
  } else {
    embed.setFooter({ text: 'Seul le propriétaire (ou la direction) peut gérer ce stock.' });
  }

  await interaction.reply({ embeds: [embed], files, components, flags: ephemeral });
  return true;
}

/** Bouton de la carte (ramasser/transformer) -> verifie le proprietaire puis ouvre le modal stock. */
export async function handleGarageVehButton(interaction: ButtonInteraction): Promise<boolean> {
  const ram = interaction.customId.startsWith(`${GarageId.VEH_RAMASSER}:`);
  const trans = interaction.customId.startsWith(`${GarageId.VEH_TRANSFORMER}:`);
  if (!ram && !trans) return false;
  const ephemeral = MessageFlags.Ephemeral;
  if (!interaction.guild) {
    await interaction.reply({ content: 'Serveur requis.', flags: ephemeral });
    return true;
  }
  const config = await getGuildConfigByGuildId(interaction.guild.id);
  if (!config) {
    await interaction.reply({ content: 'Configuration absente.', flags: ephemeral });
    return true;
  }
  const base = ram ? GarageId.VEH_RAMASSER : GarageId.VEH_TRANSFORMER;
  const vehicleId = interaction.customId.slice(base.length + 1);
  const vehicle = await getVehicleById(config.id, vehicleId);
  if (!vehicle) {
    await interaction.reply({ content: 'Véhicule introuvable.', flags: ephemeral });
    return true;
  }
  const employee = await getEmployeeByDiscordId(interaction.user.id);
  const isOwner = Boolean(employee && vehicle.ownerId && employee.id === vehicle.ownerId);
  const isDir = await isDirectionMember(interaction.guild, interaction.user.id, config);
  if (!isOwner && !isDir) {
    await interaction.reply({ content: '❌ Ce n’est pas ton véhicule.', flags: ephemeral });
    return true;
  }

  // Reutilise les modals stock (handleStockModal fait l'operation + refresh).
  const modalBase = ram ? StockModalId.RAMASSER : StockModalId.TRANSFORMER;
  const modal = new ModalBuilder()
    .setCustomId(`${modalBase}:${vehicle.id}`)
    .setTitle(ram ? 'Ramasser des saucisses' : 'Transformer en hot dogs')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(StockFieldId.QTE)
          .setLabel(ram ? 'Combien de saucisses ?' : 'Combien transformer ?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
  await interaction.showModal(modal);
  return true;
}

/** Étape 1 : la direction choisit un véhicule disponible -> on demande l'employé. */
export async function handleGaragePick(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (interaction.customId !== GarageId.PICK) return false;
  const ephemeral = MessageFlags.Ephemeral;
  if (!interaction.guild) {
    await interaction.reply({ content: 'Serveur requis.', flags: ephemeral });
    return true;
  }
  const config = await getGuildConfigByGuildId(interaction.guild.id);
  if (!config || !(await isDirectionMember(interaction.guild, interaction.user.id, config))) {
    await interaction.reply({ content: 'Réservé à la direction.', flags: ephemeral });
    return true;
  }
  const vehicleId = interaction.values[0];
  if (!vehicleId) {
    await interaction.reply({ content: 'Sélection vide.', flags: ephemeral });
    return true;
  }
  const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`${GarageId.ASSIGN_TO}:${vehicleId}`)
      .setPlaceholder('À quel employé donner ce véhicule ?'),
  );
  await interaction.reply({ content: '👤 Choisis l’employé :', components: [row], flags: ephemeral });
  return true;
}

/** Étape 2 : choix de l'employé -> attribution (limite de 3 sauf direction). */
export async function handleGarageAssign(interaction: UserSelectMenuInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith(`${GarageId.ASSIGN_TO}:`)) return false;
  const ephemeral = MessageFlags.Ephemeral;
  if (!interaction.guild) {
    await interaction.reply({ content: 'Serveur requis.', flags: ephemeral });
    return true;
  }
  const config = await getGuildConfigByGuildId(interaction.guild.id);
  if (!config || !(await isDirectionMember(interaction.guild, interaction.user.id, config))) {
    await interaction.reply({ content: 'Réservé à la direction.', flags: ephemeral });
    return true;
  }

  const vehicleId = interaction.customId.slice(`${GarageId.ASSIGN_TO}:`.length);
  const targetUserId = interaction.values[0];
  if (!targetUserId) {
    await interaction.update({ content: 'Aucun employé choisi.', components: [] });
    return true;
  }
  const employee = await getEmployeeByDiscordId(targetUserId);
  if (!employee || employee.guildConfigId !== config.id || employee.status !== 'ACTIVE') {
    await interaction.update({ content: '❌ Cette personne n’est pas un employé actif.', components: [] });
    return true;
  }

  const targetIsDirection = await isDirectionMember(interaction.guild, targetUserId, config);
  const res = await assignVehicle(
    config.id,
    vehicleId,
    employee.id,
    targetIsDirection,
    interaction.user.id,
  );
  if (!res.ok) {
    await interaction.update({ content: `❌ ${res.reason}`, components: [] });
    return true;
  }
  await publishGarageBoard(interaction.client, config.id).catch(() => undefined);
  await interaction.update({
    content: `✅ **${res.data.make} ${res.data.plate}** attribué à <@${targetUserId}>.`,
    components: [],
  });
  return true;
}
