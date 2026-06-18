import { PermissionFlagsBits, type ChatInputCommandInteraction, type Guild } from 'discord.js';

export interface DirectionRoles {
  roleDirecteur: string | null;
  roleCoDirecteur: string | null;
}

/**
 * Autorisation "direction" (CDC §10.2) : Directeur, Co-directeur ou
 * administrateur du serveur. Verifie sur le membre frais.
 */
export async function isDirectionMember(
  guild: Guild,
  userId: string,
  roles: DirectionRoles,
): Promise<boolean> {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const directionRoleIds = [roles.roleDirecteur, roles.roleCoDirecteur].filter((id): id is string =>
    Boolean(id),
  );
  return directionRoleIds.some((id) => member.roles.cache.has(id));
}

export async function isDirection(
  interaction: ChatInputCommandInteraction,
  config: DirectionRoles,
): Promise<boolean> {
  if (!interaction.guild) return false;
  return isDirectionMember(interaction.guild, interaction.user.id, config);
}
