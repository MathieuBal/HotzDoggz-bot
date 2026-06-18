import type { Employee, GuildConfig } from '@prisma/client';
import type { GuildMember } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { resolveGrade, type GradeRateRef, type GradeResolution } from './grade.js';

/** Config active du serveur (CDC §5.1). */
export function getGuildConfigByGuildId(guildId: string): Promise<GuildConfig | null> {
  return prisma.guildConfig.findUnique({ where: { guildId } });
}

/**
 * Casier actif associe a un Forum (CDC §2.4 / §5.2).
 * Retourne null si le Forum n'est pas un casier, ou si l'employe est archive.
 */
export function getActiveLockerByForum(
  guildConfigId: string,
  forumChannelId: string,
): Promise<Employee | null> {
  return prisma.employee.findFirst({
    where: { guildConfigId, casierForumId: forumChannelId, status: 'ACTIVE' },
  });
}

/** Tarifs de grade actifs (validTo null), pour la resolution de grade. */
export async function getActiveGradeRates(guildConfigId: string): Promise<GradeRateRef[]> {
  const rates = await prisma.gradeRate.findMany({
    where: { guildConfigId, validTo: null },
    select: { roleId: true, label: true, ratePerUnit: true },
  });
  return rates;
}

/** Resout le grade d'un membre a partir de ses roles Discord (§5.2). */
export async function resolveMemberGrade(
  member: GuildMember,
  guildConfigId: string,
): Promise<GradeResolution> {
  const rates = await getActiveGradeRates(guildConfigId);
  const roleIds = [...member.roles.cache.keys()];
  return resolveGrade(roleIds, rates);
}

/** Associe (ou met a jour) un employe a son casier (§5.2). */
export function associateEmployee(params: {
  guildConfigId: string;
  discordUserId: string;
  nomRP: string;
  casierForumId: string;
}): Promise<Employee> {
  return prisma.employee.upsert({
    where: { discordUserId: params.discordUserId },
    create: {
      guildConfigId: params.guildConfigId,
      discordUserId: params.discordUserId,
      nomRP: params.nomRP,
      casierForumId: params.casierForumId,
      status: 'ACTIVE',
    },
    update: {
      nomRP: params.nomRP,
      casierForumId: params.casierForumId,
      status: 'ACTIVE',
    },
  });
}

/** Archive un employe : conserve l'historique, empeche les nouvelles ventes (§5.2). */
export function archiveEmployee(discordUserId: string): Promise<Employee> {
  return prisma.employee.update({
    where: { discordUserId },
    data: { status: 'ARCHIVED' },
  });
}
