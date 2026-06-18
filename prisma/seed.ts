import { PrismaClient } from '@prisma/client';
import { config as loadDotenv } from 'dotenv';

loadDotenv();

/**
 * Seed de configuration (CDC §13 Phase 1 : "seed de configuration").
 *
 * Idempotent et pilote par l'environnement : il enregistre/MAJ la GuildConfig
 * du serveur et la grille salariale (GradeRate) pour les roles renseignes,
 * SANS reecrire l'historique des tarifs (un changement de tarif clot l'ancien
 * et en cree un nouveau — §6.2).
 *
 * Decision metier : direction (Directeur & Co-directeur) = 185 $/unite.
 */

const prisma = new PrismaClient();

const GRADE_RATE_BY_ENV: Array<{ env: string; label: string; rate: number }> = [
  { env: 'ROLE_DIRECTEUR', label: 'Directeur', rate: 185 },
  { env: 'ROLE_CO_DIRECTEUR', label: 'Co-directeur', rate: 185 },
  { env: 'ROLE_CHEF_EQUIPE', label: "Chef d'equipe", rate: 175 },
  { env: 'ROLE_EXPERIMENTE', label: 'Experimente', rate: 165 },
  { env: 'ROLE_NOVICE', label: 'Novice', rate: 155 },
  { env: 'ROLE_STAGIAIRE', label: 'Stagiaire', rate: 145 },
];

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

async function upsertGradeRate(
  guildConfigId: string,
  roleId: string,
  label: string,
  rate: number,
): Promise<'created' | 'updated' | 'unchanged'> {
  const active = await prisma.gradeRate.findFirst({
    where: { guildConfigId, roleId, validTo: null },
  });
  if (active && active.ratePerUnit === rate && active.label === label) {
    return 'unchanged';
  }
  if (active) {
    await prisma.gradeRate.update({ where: { id: active.id }, data: { validTo: new Date() } });
  }
  await prisma.gradeRate.create({
    data: { guildConfigId, roleId, label, ratePerUnit: rate },
  });
  return active ? 'updated' : 'created';
}

async function main(): Promise<void> {
  const guildId = env('DISCORD_GUILD_ID');
  if (!guildId) {
    console.warn(
      '[seed] DISCORD_GUILD_ID non defini : rien a seeder. ' +
        'Renseigne au minimum DISCORD_GUILD_ID dans .env.',
    );
    return;
  }

  const config = await prisma.guildConfig.upsert({
    where: { guildId },
    create: {
      guildId,
      timezone: env('TIMEZONE') ?? 'Europe/Paris',
      roleDirecteur: env('ROLE_DIRECTEUR') ?? null,
      roleCoDirecteur: env('ROLE_CO_DIRECTEUR') ?? null,
      roleChefEquipe: env('ROLE_CHEF_EQUIPE') ?? null,
      roleExperimente: env('ROLE_EXPERIMENTE') ?? null,
      roleNovice: env('ROLE_NOVICE') ?? null,
      roleStagiaire: env('ROLE_STAGIAIRE') ?? null,
      channelControl: env('CHANNEL_CONTROL') ?? null,
      channelAccounting: env('CHANNEL_ACCOUNTING') ?? null,
      channelPayroll: env('CHANNEL_PAYROLL') ?? null,
      channelLogs: env('CHANNEL_LOGS') ?? null,
      channelWeeklyBoard: env('CHANNEL_WEEKLY_BOARD') ?? null,
    },
    // On ne met a jour que les champs explicitement fournis (sinon on conserve l'existant).
    update: {
      timezone: env('TIMEZONE') ?? undefined,
      roleDirecteur: env('ROLE_DIRECTEUR') ?? undefined,
      roleCoDirecteur: env('ROLE_CO_DIRECTEUR') ?? undefined,
      roleChefEquipe: env('ROLE_CHEF_EQUIPE') ?? undefined,
      roleExperimente: env('ROLE_EXPERIMENTE') ?? undefined,
      roleNovice: env('ROLE_NOVICE') ?? undefined,
      roleStagiaire: env('ROLE_STAGIAIRE') ?? undefined,
      channelControl: env('CHANNEL_CONTROL') ?? undefined,
      channelAccounting: env('CHANNEL_ACCOUNTING') ?? undefined,
      channelPayroll: env('CHANNEL_PAYROLL') ?? undefined,
      channelLogs: env('CHANNEL_LOGS') ?? undefined,
      channelWeeklyBoard: env('CHANNEL_WEEKLY_BOARD') ?? undefined,
    },
  });
  console.info(`[seed] GuildConfig OK (guildId=${guildId}, id=${config.id})`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const { env: envName, label, rate } of GRADE_RATE_BY_ENV) {
    const roleId = env(envName);
    if (!roleId) {
      console.warn(`[seed] ${envName} non defini : tarif "${label}" ignore.`);
      continue;
    }
    const result = await upsertGradeRate(config.id, roleId, label, rate);
    if (result === 'created') created++;
    else if (result === 'updated') updated++;
    else skipped++;
  }
  console.info(
    `[seed] GradeRate — crees: ${created}, mis a jour: ${updated}, inchanges: ${skipped}`,
  );
}

main()
  .catch((err) => {
    console.error('[seed] Echec :', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
