import { SaleStatus } from '@prisma/client';
import type { Collection, Guild, GuildMember } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { listEmployeeBadges } from '../badges/badgeService.js';
import { UNIT_BADGES, formatBadge } from '../badges/registry.js';
import { getOpenWeekSnapshot } from '../accounting/accountingService.js';
import { getActiveGradeRates } from './employeeService.js';
import { resolveGrade } from './grade.js';

/**
 * Couche de donnees du salon « Gestion des employes » (direction). Agrege, pour
 * chaque employe, son identite, sa presence sur le serveur, son grade resolu en
 * direct depuis Discord, ses stats cumulees et de la semaine en cours, ses
 * badges/prestige — et detecte les incoherences (employe parti, grade absent ou
 * ambigu, membre grade mais non enregistre).
 */

// Statuts d'une vente "comptee" (validee et au-dela). Aligne sur profileService.
const COUNTED = [SaleStatus.VALIDEE, SaleStatus.INTEGREE_A_LA_PAIE, SaleStatus.PAYEE];

export interface StaffRosterEntry {
  employeeId: string;
  discordUserId: string;
  nomRP: string;
  active: boolean;
  multiplier: number;
  onServer: boolean; // membre present sur le serveur
  gradeLabel: string | null; // grade resolu (roles actuels, sinon dernier connu)
  gradeFromRoles: boolean; // true si lu sur les roles actuels du membre
  ambiguous: boolean; // plusieurs roles de grade simultanes
  missingGrade: boolean; // present mais aucun role de grade
}

export interface StaffAnomaly {
  type: 'left' | 'missing_grade' | 'ambiguous' | 'unregistered';
  detail: string; // texte pret a afficher (mention incluse)
}

export interface StaffRoster {
  active: StaffRosterEntry[];
  archived: StaffRosterEntry[];
  anomalies: StaffAnomaly[];
  membersResolved: boolean; // false si l'intent GuildMembers n'a rien renvoye
}

async function fetchMembersSafe(guild: Guild): Promise<Collection<string, GuildMember> | null> {
  try {
    return await guild.members.fetch();
  } catch {
    return null;
  }
}

/** Trombinoscope complet : actifs, archives et anomalies. */
export async function getStaffRoster(guild: Guild, guildConfigId: string): Promise<StaffRoster> {
  const [employees, rates, members] = await Promise.all([
    prisma.employee.findMany({
      where: { guildConfigId },
      select: {
        id: true,
        discordUserId: true,
        nomRP: true,
        status: true,
        bonusMultiplier: true,
        lastGradeLabel: true,
      },
      orderBy: { nomRP: 'asc' },
    }),
    getActiveGradeRates(guildConfigId),
    fetchMembersSafe(guild),
  ]);

  const gradeRoleIds = new Set(rates.map((r) => r.roleId));
  const registered = new Set(employees.map((e) => e.discordUserId));

  const active: StaffRosterEntry[] = [];
  const archived: StaffRosterEntry[] = [];
  const anomalies: StaffAnomaly[] = [];

  for (const e of employees) {
    const member = members?.get(e.discordUserId) ?? guild.members.cache.get(e.discordUserId) ?? null;
    const entry: StaffRosterEntry = {
      employeeId: e.id,
      discordUserId: e.discordUserId,
      nomRP: e.nomRP,
      active: e.status === 'ACTIVE',
      multiplier: e.bonusMultiplier,
      onServer: Boolean(member),
      gradeLabel: e.lastGradeLabel,
      gradeFromRoles: false,
      ambiguous: false,
      missingGrade: false,
    };
    if (member) {
      const res = resolveGrade([...member.roles.cache.keys()], rates);
      entry.ambiguous = res.ambiguous;
      entry.missingGrade = res.missing;
      if (res.selected) {
        entry.gradeLabel = res.selected.label;
        entry.gradeFromRoles = true;
      }
    }

    if (entry.active) {
      active.push(entry);
      if (!entry.onServer) {
        anomalies.push({ type: 'left', detail: `**${e.nomRP}** (<@${e.discordUserId}>) a quitté le serveur` });
      } else if (entry.ambiguous) {
        anomalies.push({ type: 'ambiguous', detail: `**${e.nomRP}** a plusieurs rôles de grade en même temps` });
      } else if (entry.missingGrade) {
        anomalies.push({ type: 'missing_grade', detail: `**${e.nomRP}** n'a aucun rôle de grade` });
      }
    } else {
      archived.push(entry);
    }
  }

  // Membres presents avec un role de grade mais sans fiche employe.
  if (members && gradeRoleIds.size > 0) {
    for (const m of members.values()) {
      if (m.user.bot || registered.has(m.id)) continue;
      const hasGrade = [...m.roles.cache.keys()].some((id) => gradeRoleIds.has(id));
      if (hasGrade) {
        anomalies.push({
          type: 'unregistered',
          detail: `<@${m.id}> a un grade mais n'est pas enregistré (\`/employe associer\`)`,
        });
      }
    }
  }

  return { active, archived, anomalies, membersResolved: members !== null };
}

export interface StaffCard {
  employeeId: string;
  discordUserId: string;
  nomRP: string;
  active: boolean;
  multiplier: number;
  since: Date;
  casierForumId: string | null;
  // Presence Discord
  onServer: boolean;
  displayName: string | null;
  joinedServerAt: Date | null;
  avatarUrl: string | null;
  // Grade (resolu en direct depuis les roles, sinon dernier connu)
  gradeLabel: string | null;
  gradeFromRoles: boolean;
  gradeRate: number | null;
  ambiguous: boolean;
  missingGrade: boolean;
  matchedGrades: string[]; // libelles des grades reconnus simultanement
  // Cumul carriere
  pnjSalesCount: number;
  pnjUnits: number;
  pnjRevenue: number;
  directSalesCount: number;
  paidTotal: number;
  promotions: number;
  lastPromotion: string | null;
  // Semaine en cours
  weekOpen: boolean;
  weekUnits: number;
  weekRevenue: number;
  weekSalaryEstimate: number;
  // Badges / prestige
  badges: string[];
  prestigeLabel: string | null;
}

/** Carte detaillee d'un employe pour la direction. Null si introuvable. */
export async function getStaffCard(
  guild: Guild,
  guildConfigId: string,
  employeeId: string,
): Promise<StaffCard | null> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.guildConfigId !== guildConfigId) return null;

  const rates = await getActiveGradeRates(guildConfigId);
  const member = await guild.members.fetch(employee.discordUserId).catch(() => null);

  let gradeLabel = employee.lastGradeLabel;
  let gradeRate: number | null = employee.lastGradeRate;
  let gradeFromRoles = false;
  let ambiguous = false;
  let missingGrade = false;
  let matchedGrades: string[] = [];
  if (member) {
    const res = resolveGrade([...member.roles.cache.keys()], rates);
    matchedGrades = res.matched.map((m) => m.label);
    ambiguous = res.ambiguous;
    missingGrade = res.missing;
    if (res.selected) {
      gradeLabel = res.selected.label;
      gradeRate = res.selected.ratePerUnit;
      gradeFromRoles = true;
    }
  }

  const [pnjSales, directSalesCount, paid, promotions, lastPromo, badgeDefs, snapshot] =
    await Promise.all([
      prisma.sale.findMany({
        where: { employeeId, status: { in: COUNTED } },
        select: { validatedQuantity: true, pnjUnitPriceSnapshot: true },
      }),
      prisma.directSale.count({ where: { employeeId, status: { in: COUNTED } } }),
      prisma.payroll.aggregate({
        where: { employeeId, status: 'PAID' },
        _sum: { totalAmount: true },
      }),
      prisma.employeeGradeEvent.count({ where: { employeeId, fromRate: { not: null } } }),
      prisma.employeeGradeEvent.findFirst({
        where: { employeeId },
        orderBy: { createdAt: 'desc' },
        select: { toLabel: true },
      }),
      listEmployeeBadges(employeeId),
      getOpenWeekSnapshot(guildConfigId),
    ]);

  let pnjUnits = 0;
  let pnjRevenue = 0;
  for (const s of pnjSales) {
    const q = s.validatedQuantity ?? 0;
    pnjUnits += q;
    pnjRevenue += q * (s.pnjUnitPriceSnapshot ?? 0);
  }

  const weekLine = snapshot?.report.employees.find((e) => e.employeeId === employeeId) ?? null;

  // Prestige = plus haut palier de PRODUCTION possede (UNIT_BADGES trie croissant).
  const ownedKeys = new Set(badgeDefs.map((b) => b.key));
  const prestige = [...UNIT_BADGES].reverse().find((b) => ownedKeys.has(b.key)) ?? null;

  return {
    employeeId: employee.id,
    discordUserId: employee.discordUserId,
    nomRP: employee.nomRP,
    active: employee.status === 'ACTIVE',
    multiplier: employee.bonusMultiplier,
    since: employee.createdAt,
    casierForumId: employee.casierForumId,
    onServer: Boolean(member),
    displayName: member?.displayName ?? null,
    joinedServerAt: member?.joinedAt ?? null,
    avatarUrl: member?.displayAvatarURL() ?? null,
    gradeLabel,
    gradeFromRoles,
    gradeRate,
    ambiguous,
    missingGrade,
    matchedGrades,
    pnjSalesCount: pnjSales.length,
    pnjUnits,
    pnjRevenue,
    directSalesCount,
    paidTotal: paid._sum.totalAmount ?? 0,
    promotions,
    lastPromotion: lastPromo?.toLabel ?? null,
    weekOpen: Boolean(snapshot),
    weekUnits: weekLine?.quantity ?? 0,
    weekRevenue: weekLine?.revenue ?? 0,
    weekSalaryEstimate: weekLine?.salary ?? 0,
    badges: badgeDefs.map(formatBadge),
    prestigeLabel: prestige ? `${prestige.emoji} ${prestige.label}` : null,
  };
}

/** Renomme un employe (nom RP). */
export async function renameEmployee(employeeId: string, nomRP: string): Promise<void> {
  await prisma.employee.update({ where: { id: employeeId }, data: { nomRP } });
}

/** Definit le multiplicateur bracelet d'un employe. */
export async function setEmployeeMultiplier(employeeId: string, multiplier: number): Promise<void> {
  await prisma.employee.update({ where: { id: employeeId }, data: { bonusMultiplier: multiplier } });
}

/** Reintegre un employe archive (status -> ACTIVE). */
export async function reactivateEmployee(employeeId: string): Promise<void> {
  await prisma.employee.update({ where: { id: employeeId }, data: { status: 'ACTIVE' } });
}
