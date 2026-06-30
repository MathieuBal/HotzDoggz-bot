import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { GuildConfig } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import {
  checkAndAwardBadges,
  checkAndAwardContributionBadges,
  listEmployeeBadges,
} from '../../modules/badges/badgeService.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import {
  getActiveGradeRates,
  getGuildConfigByGuildId,
} from '../../modules/employees/employeeService.js';
import {
  getStaffCard,
  renameEmployee,
  reactivateEmployee,
  setEmployeeMultiplier,
} from '../../modules/employees/staffService.js';
import { isDirectionMember } from '../permissions.js';
import { syncPrestigeRole } from '../prestige.js';
import { buildConfirmMessage } from '../panel/confirmUi.js';
import { putPending } from '../panel/pending.js';
import { StaffButtonId, StaffFieldId, StaffModalId, StaffSelectId } from '../components/ids.js';
import { buildStaffCard } from './staffCard.js';

const EPH = MessageFlags.Ephemeral;

interface StaffCtx {
  guild: Guild;
  config: GuildConfig;
}

/** Resout guild + config + autorisation direction. Repond l'erreur le cas echeant. */
async function resolveCtx(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
): Promise<StaffCtx | null> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Serveur requis.', flags: EPH });
    return null;
  }
  const config = await getGuildConfigByGuildId(interaction.guild.id);
  if (!config) {
    await interaction.reply({ content: 'Configuration absente.', flags: EPH });
    return null;
  }
  if (!(await isDirectionMember(interaction.guild, interaction.user.id, config))) {
    await interaction.reply({ content: 'Action réservée à la direction.', flags: EPH });
    return null;
  }
  return { guild: interaction.guild, config };
}

/** Suffixe employeeId d'un customId `staff:<action>:<employeeId>` (cuid sans `:`). */
function idFrom(customId: string, prefix: string): string {
  return customId.slice(prefix.length + 1);
}

// ── Menus ──────────────────────────────────────────────────────────────────

/** Menus du salon gestion : ouvrir une carte, ou appliquer un grade. */
export async function handleStaffSelect(
  interaction: StringSelectMenuInteraction,
): Promise<boolean> {
  if (interaction.customId === StaffSelectId.OPEN) {
    const ctx = await resolveCtx(interaction);
    if (!ctx) return true;
    const employeeId = interaction.values[0];
    if (!employeeId) {
      await interaction.reply({ content: 'Sélection vide.', flags: EPH });
      return true;
    }
    await interaction.deferReply({ flags: EPH });
    const card = await getStaffCard(ctx.guild, ctx.config.id, employeeId);
    if (!card) {
      await interaction.editReply('Employé introuvable (peut-être supprimé).');
      return true;
    }
    await interaction.editReply(buildStaffCard(card));
    return true;
  }

  if (interaction.customId.startsWith(`${StaffSelectId.GRADE_SET}:`)) {
    const ctx = await resolveCtx(interaction);
    if (!ctx) return true;
    const employeeId = idFrom(interaction.customId, StaffSelectId.GRADE_SET);
    const value = interaction.values[0];
    if (!value) {
      await interaction.reply({ content: 'Sélection vide.', flags: EPH });
      return true;
    }
    await interaction.deferUpdate();
    const msg = await applyGrade(ctx, interaction.user.id, employeeId, value);
    scheduleDashboardUpdate(interaction.client, ctx.config.id);
    await interaction.editReply({ content: msg, embeds: [], components: [] });
    return true;
  }

  return false;
}

// ── Boutons ──────────────────────────────────────────────────────────────────

export async function handleStaffButton(interaction: ButtonInteraction): Promise<boolean> {
  const { customId } = interaction;
  if (!customId.startsWith('staff:')) return false;

  // Boutons ouvrant une modale / un menu : pas de defer avant.
  if (customId.startsWith(`${StaffButtonId.RENAME}:`)) {
    return openRenameModal(interaction);
  }
  if (customId.startsWith(`${StaffButtonId.BRACELET}:`)) {
    return openBraceletModal(interaction);
  }
  if (customId.startsWith(`${StaffButtonId.GRADE}:`)) {
    return openGradeMenu(interaction);
  }
  if (customId.startsWith(`${StaffButtonId.ARCHIVE}:`)) {
    return promptArchive(interaction);
  }
  if (customId.startsWith(`${StaffButtonId.REACTIVATE}:`)) {
    return doReactivate(interaction);
  }
  if (customId.startsWith(`${StaffButtonId.RESYNC}:`)) {
    return doResync(interaction);
  }
  if (customId.startsWith(`${StaffButtonId.REFRESH}:`)) {
    return doRefresh(interaction);
  }
  return false;
}

async function openRenameModal(interaction: ButtonInteraction): Promise<boolean> {
  const ctx = await resolveCtx(interaction);
  if (!ctx) return true;
  const employeeId = idFrom(interaction.customId, StaffButtonId.RENAME);
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { nomRP: true },
  });
  const modal = new ModalBuilder()
    .setCustomId(`${StaffModalId.RENAME}:${employeeId}`)
    .setTitle('Renommer un employé')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(StaffFieldId.NOM_RP)
          .setLabel('Nouveau nom RP')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
          .setValue(employee?.nomRP ?? ''),
      ),
    );
  await interaction.showModal(modal);
  return true;
}

async function openBraceletModal(interaction: ButtonInteraction): Promise<boolean> {
  const ctx = await resolveCtx(interaction);
  if (!ctx) return true;
  const employeeId = idFrom(interaction.customId, StaffButtonId.BRACELET);
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { bonusMultiplier: true },
  });
  const modal = new ModalBuilder()
    .setCustomId(`${StaffModalId.BRACELET}:${employeeId}`)
    .setTitle('Bracelet (multiplicateur)')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(StaffFieldId.MULTIPLICATEUR)
          .setLabel('Multiplicateur (1 à 10)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(2)
          .setValue(String(employee?.bonusMultiplier ?? 1)),
      ),
    );
  await interaction.showModal(modal);
  return true;
}

async function openGradeMenu(interaction: ButtonInteraction): Promise<boolean> {
  const ctx = await resolveCtx(interaction);
  if (!ctx) return true;
  const employeeId = idFrom(interaction.customId, StaffButtonId.GRADE);
  const rates = await getActiveGradeRates(ctx.config.id);
  if (rates.length === 0) {
    await interaction.reply({
      content: 'Aucun grade configuré (`/config roles`).',
      flags: EPH,
    });
    return true;
  }
  const options = rates
    .slice()
    .sort((a, b) => a.ratePerUnit - b.ratePerUnit)
    .slice(0, 24)
    .map((r) => ({ label: r.label, value: r.roleId, description: `${r.ratePerUnit} $/u` }));
  options.push({ label: 'Retirer le grade', value: 'none', description: 'Enlève tous les rôles de grade' });

  await interaction.reply({
    content: 'Choisis le nouveau grade (les rôles Discord seront ajustés) :',
    flags: EPH,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${StaffSelectId.GRADE_SET}:${employeeId}`)
          .setPlaceholder('🎖️ Nouveau grade…')
          .addOptions(options),
      ),
    ],
  });
  return true;
}

async function promptArchive(interaction: ButtonInteraction): Promise<boolean> {
  const ctx = await resolveCtx(interaction);
  if (!ctx) return true;
  const employeeId = idFrom(interaction.customId, StaffButtonId.ARCHIVE);
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { discordUserId: true, nomRP: true, status: true },
  });
  if (!employee) {
    await interaction.reply({ content: 'Employé introuvable.', flags: EPH });
    return true;
  }
  if (employee.status === 'ARCHIVED') {
    await interaction.reply({ content: `**${employee.nomRP}** est déjà archivé.`, flags: EPH });
    return true;
  }
  const token = putPending(interaction.user.id, {
    kind: 'archive',
    guildConfigId: ctx.config.id,
    discordUserId: employee.discordUserId,
    nomRP: employee.nomRP,
  });
  await interaction.reply({
    flags: EPH,
    ...buildConfirmMessage({
      title: '📦 Archiver un employé',
      description: `Archiver **${employee.nomRP}** (<@${employee.discordUserId}>) ? Ses futures ventes ne seront plus comptées, mais tout l’historique est conservé.`,
      token,
      confirmLabel: 'Archiver',
      danger: true,
    }),
  });
  return true;
}

async function doReactivate(interaction: ButtonInteraction): Promise<boolean> {
  const ctx = await resolveCtx(interaction);
  if (!ctx) return true;
  const employeeId = idFrom(interaction.customId, StaffButtonId.REACTIVATE);
  await interaction.deferUpdate();
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { status: true, nomRP: true },
  });
  if (employee && employee.status === 'ARCHIVED') {
    await reactivateEmployee(employeeId);
    await writeAudit(prisma, {
      guildConfigId: ctx.config.id,
      action: 'EMPLOYEE_REACTIVATED',
      authorDiscordId: interaction.user.id,
      entityType: 'Employee',
      entityId: employeeId,
      before: { status: 'ARCHIVED' },
      after: { status: 'ACTIVE' },
    });
    scheduleDashboardUpdate(interaction.client, ctx.config.id);
  }
  await rerenderCard(interaction, ctx, employeeId);
  return true;
}

async function doResync(interaction: ButtonInteraction): Promise<boolean> {
  const ctx = await resolveCtx(interaction);
  if (!ctx) return true;
  const employeeId = idFrom(interaction.customId, StaffButtonId.RESYNC);
  await interaction.deferUpdate();
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { discordUserId: true },
  });
  if (employee) {
    await checkAndAwardBadges(ctx.config.id, employeeId);
    await checkAndAwardContributionBadges(ctx.config.id, employeeId);
    const member = await ctx.guild.members.fetch(employee.discordUserId).catch(() => null);
    if (member) {
      const owned = new Set((await listEmployeeBadges(employeeId)).map((b) => b.key));
      await syncPrestigeRole(member, owned);
    }
  }
  await rerenderCard(interaction, ctx, employeeId);
  return true;
}

async function doRefresh(interaction: ButtonInteraction): Promise<boolean> {
  const ctx = await resolveCtx(interaction);
  if (!ctx) return true;
  const employeeId = idFrom(interaction.customId, StaffButtonId.REFRESH);
  await interaction.deferUpdate();
  await rerenderCard(interaction, ctx, employeeId);
  return true;
}

// ── Modales ──────────────────────────────────────────────────────────────────

export async function handleStaffModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const { customId } = interaction;

  if (customId.startsWith(`${StaffModalId.RENAME}:`)) {
    const ctx = await resolveCtx(interaction);
    if (!ctx) return true;
    const employeeId = idFrom(interaction.customId, StaffModalId.RENAME);
    const nomRP = interaction.fields.getTextInputValue(StaffFieldId.NOM_RP).trim();
    await interaction.deferUpdate();
    if (nomRP.length > 0) {
      const before = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { nomRP: true },
      });
      await renameEmployee(employeeId, nomRP);
      await writeAudit(prisma, {
        guildConfigId: ctx.config.id,
        action: 'EMPLOYEE_RENAMED',
        authorDiscordId: interaction.user.id,
        entityType: 'Employee',
        entityId: employeeId,
        before: { nomRP: before?.nomRP },
        after: { nomRP },
      });
      scheduleDashboardUpdate(interaction.client, ctx.config.id);
    }
    await rerenderCard(interaction, ctx, employeeId);
    return true;
  }

  if (customId.startsWith(`${StaffModalId.BRACELET}:`)) {
    const ctx = await resolveCtx(interaction);
    if (!ctx) return true;
    const employeeId = idFrom(interaction.customId, StaffModalId.BRACELET);
    const raw = interaction.fields.getTextInputValue(StaffFieldId.MULTIPLICATEUR).trim();
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value) || value < 1 || value > 10) {
      await interaction.reply({ content: 'Multiplicateur invalide (entier de 1 à 10).', flags: EPH });
      return true;
    }
    await interaction.deferUpdate();
    const before = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { bonusMultiplier: true },
    });
    await setEmployeeMultiplier(employeeId, value);
    await writeAudit(prisma, {
      guildConfigId: ctx.config.id,
      action: 'EMPLOYEE_BRACELET_SET',
      authorDiscordId: interaction.user.id,
      entityType: 'Employee',
      entityId: employeeId,
      before: { bonusMultiplier: before?.bonusMultiplier },
      after: { bonusMultiplier: value },
    });
    scheduleDashboardUpdate(interaction.client, ctx.config.id);
    await rerenderCard(interaction, ctx, employeeId);
    return true;
  }

  return false;
}

// ── Coeur ─────────────────────────────────────────────────────────────────────

/** Reconstruit la carte detaillee dans le message editable courant. */
async function rerenderCard(
  interaction:
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
  ctx: StaffCtx,
  employeeId: string,
): Promise<void> {
  const card = await getStaffCard(ctx.guild, ctx.config.id, employeeId);
  if (!card) {
    await interaction.editReply({ content: 'Employé introuvable.', embeds: [], components: [] });
    return;
  }
  await interaction.editReply(buildStaffCard(card));
}

/**
 * Applique un grade : ajuste les roles Discord (retire les autres grades, pose
 * le bon), met a jour le dernier grade connu + journalise (grade event + audit).
 * @param value roleId du grade cible, ou 'none' pour retirer tout grade.
 * @returns message de resultat a afficher.
 */
async function applyGrade(
  ctx: StaffCtx,
  authorId: string,
  employeeId: string,
  value: string,
): Promise<string> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.guildConfigId !== ctx.config.id) return 'Employé introuvable.';

  const rates = await getActiveGradeRates(ctx.config.id);
  const gradeRoleIds = new Set(rates.map((r) => r.roleId));
  const member = await ctx.guild.members.fetch(employee.discordUserId).catch(() => null);

  const target = value === 'none' ? null : rates.find((r) => r.roleId === value);
  if (value !== 'none' && !target) return 'Grade inconnu (configuration modifiée ?).';

  // Ajustement des roles Discord (best-effort : permission + hierarchie requises).
  let roleWarning = '';
  if (member) {
    try {
      const toRemove = [...member.roles.cache.keys()].filter(
        (id) => gradeRoleIds.has(id) && id !== target?.roleId,
      );
      for (const id of toRemove) {
        await member.roles.remove(id, 'Changement de grade (gestion RH)').catch(() => undefined);
      }
      if (target && !member.roles.cache.has(target.roleId)) {
        await member.roles.add(target.roleId, 'Changement de grade (gestion RH)');
      }
    } catch (err) {
      logger.warn({ err, employeeId }, 'Ajustement des rôles de grade KO (permission/hiérarchie ?)');
      roleWarning =
        '\n⚠️ Les rôles Discord n’ont pas pu être ajustés (vérifie « Gérer les rôles » et la hiérarchie du bot).';
    }
  } else {
    roleWarning = '\n⚠️ Membre absent du serveur : seul le grade enregistré a été mis à jour.';
  }

  // Mise a jour du dernier grade connu + journalisation.
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: employeeId },
      data: {
        lastGradeRoleId: target?.roleId ?? null,
        lastGradeLabel: target?.label ?? null,
        lastGradeRate: target?.ratePerUnit ?? null,
      },
    });
    if (target) {
      await tx.employeeGradeEvent.create({
        data: {
          guildConfigId: ctx.config.id,
          employeeId,
          fromLabel: employee.lastGradeLabel,
          fromRate: employee.lastGradeRate,
          toLabel: target.label,
          toRate: target.ratePerUnit,
          roleId: target.roleId,
        },
      });
    }
    await writeAudit(tx, {
      guildConfigId: ctx.config.id,
      action: target ? 'EMPLOYEE_GRADE_SET' : 'EMPLOYEE_GRADE_CLEARED',
      authorDiscordId: authorId,
      entityType: 'Employee',
      entityId: employeeId,
      before: { gradeLabel: employee.lastGradeLabel, gradeRate: employee.lastGradeRate },
      after: target ? { gradeLabel: target.label, gradeRate: target.ratePerUnit } : { gradeLabel: null },
      correlationId: randomUUID(),
    });
  });

  const head = target
    ? `🎖️ **${employee.nomRP}** est désormais **${target.label}** (${target.ratePerUnit} $/u).`
    : `🎖️ Grade retiré à **${employee.nomRP}**.`;
  return head + roleWarning;
}
