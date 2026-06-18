import { PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';

export interface DirectionRoles {
  roleDirecteur: string | null;
  roleCoDirecteur: string | null;
}

/**
 * Autorisation "direction" (CDC §10.2) : Directeur, Co-directeur ou
 * administrateur du serveur. La verification se fait sur le membre frais.
 */
export async function isDirection(
  interaction: ChatInputCommandInteraction,
  config: DirectionRoles,
): Promise<boolean> {
  if (!interaction.guild) return false;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const directionRoleIds = [config.roleDirecteur, config.roleCoDirecteur].filter(
    (id): id is string => Boolean(id),
  );
  return directionRoleIds.some((id) => member.roles.cache.has(id));
}
