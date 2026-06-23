import {
  ActionRowBuilder,
  MessageFlags,
  UserSelectMenuBuilder,
  type StringSelectMenuInteraction,
  type UserSelectMenuInteraction,
} from 'discord.js';
import {
  getEmployeeByDiscordId,
  getGuildConfigByGuildId,
} from '../../modules/employees/employeeService.js';
import { assignVehicle } from '../../modules/garage/garageService.js';
import { GarageId } from '../components/ids.js';
import { isDirectionMember } from '../permissions.js';
import { publishGarageBoard } from './garageBoard.js';

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
