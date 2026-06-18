import { AttachmentType, ForumTagKey, Prisma, SaleStatus } from '@prisma/client';
import { ChannelType, type AnyThreadChannel, type ForumChannel, type Message } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { mentionDirection, postToLogs } from '../../discord/notify.js';
import { writeAudit } from '../audit/auditService.js';
import {
  getActiveLockerByForum,
  getGuildConfigByGuildId,
  resolveMemberGrade,
} from '../employees/employeeService.js';
import { setCasierTag } from '../lockers/casierTags.js';
import { createControlPost } from '../verification/controlPost.js';
import { downloadAndStore, isImageAttachment, type StoredAttachment } from './attachments.js';
import { extractQuantity } from './quantity.js';
import { allocateReference } from './referenceService.js';
import { evaluateSubmission } from './submission.js';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Recupere le message initial du thread, avec quelques retries (CDC §4.2). */
async function fetchStarter(thread: AnyThreadChannel): Promise<Message | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const msg = await thread.fetchStarterMessage();
      if (msg) return msg;
    } catch {
      /* pas encore disponible */
    }
    await delay(400 * (attempt + 1));
  }
  return null;
}

function isUniqueViolationOn(err: unknown, field: string): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = err.meta?.target;
    return Array.isArray(target) ? target.includes(field) : target === field;
  }
  return false;
}

function casierThreadUrl(guildId: string, threadId: string): string {
  return `https://discord.com/channels/${guildId}/${threadId}`;
}

interface PersistInput {
  guildConfigId: string;
  weekId: string;
  employeeId: string;
  threadId: string;
  declaredQuantity: number;
  declaredAt: Date;
  gradeLabel: string | null;
  gradeRoleId: string | null;
  salaryRate: number | null;
  pnjUnitPrice: number;
  attachments: StoredAttachment[];
  correlationId: string;
  authorDiscordId: string;
}

type PersistResult = { saleId: string; reference: string } | 'already_ingested';

/** Transaction de creation de vente + preuves + historique + audit (§9.4). */
async function persistSale(input: PersistInput): Promise<PersistResult> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const reference = await allocateReference(
          tx,
          input.guildConfigId,
          input.declaredAt.getFullYear(),
        );
        const sale = await tx.sale.create({
          data: {
            reference,
            guildConfigId: input.guildConfigId,
            weekId: input.weekId,
            employeeId: input.employeeId,
            threadId: input.threadId,
            declaredQuantity: input.declaredQuantity,
            declaredAt: input.declaredAt,
            gradeSnapshot: input.gradeLabel,
            gradeRoleIdSnapshot: input.gradeRoleId,
            salaryRateSnapshot: input.salaryRate,
            pnjUnitPriceSnapshot: input.pnjUnitPrice,
            status: 'SOUMISE',
          },
        });
        if (input.attachments.length > 0) {
          await tx.saleAttachment.createMany({
            data: input.attachments.map((a) => ({ saleId: sale.id, ...a })),
          });
        }
        await tx.saleStatusHistory.create({
          data: { saleId: sale.id, toStatus: 'SOUMISE', correlationId: input.correlationId },
        });
        await writeAudit(tx, {
          guildConfigId: input.guildConfigId,
          action: 'SALE_INGESTED',
          authorDiscordId: input.authorDiscordId,
          entityType: 'Sale',
          entityId: sale.id,
          after: { reference, declaredQuantity: input.declaredQuantity },
          correlationId: input.correlationId,
        });
        return { saleId: sale.id, reference };
      });
    } catch (err) {
      if (isUniqueViolationOn(err, 'threadId')) return 'already_ingested';
      if (isUniqueViolationOn(err, 'reference')) continue; // collision : reallouer
      throw err;
    }
  }
  throw new Error('Allocation de reference impossible apres plusieurs tentatives');
}

/**
 * Ingestion d'un post de casier (CDC Annexe C).
 * Idempotent (cle : threadId). Ne cree jamais la vente a la place de l'employe :
 * il detecte, controle, copie les preuves, cree la fiche et notifie la direction.
 */
export async function ingestThread(thread: AnyThreadChannel): Promise<void> {
  const parentId = thread.parentId;
  if (!parentId) return;

  const guild = thread.guild;
  const config = await getGuildConfigByGuildId(guild.id);
  if (!config) return;

  const locker = await getActiveLockerByForum(config.id, parentId);
  if (!locker) return; // pas un casier actif → on ignore

  // Idempotence (early-out)
  const existing = await prisma.sale.findUnique({ where: { threadId: thread.id } });
  if (existing) return;

  const starter = await fetchStarter(thread);
  if (!starter) {
    logger.warn({ threadId: thread.id }, 'Message initial introuvable — fallback messageCreate');
    return;
  }

  const correlationId = randomUUID();
  const log = logger.child({ correlationId, threadId: thread.id, locker: locker.id });

  const authorId = starter.author.id;
  const authorIsOwner = authorId === locker.discordUserId;

  const quantity = extractQuantity(thread.name, starter.content);
  const images = [...starter.attachments.values()].filter(isImageAttachment);

  const newTag = await prisma.forumTag.findUnique({
    where: { forumChannelId_key: { forumChannelId: parentId, key: ForumTagKey.NOUVELLE_VENTE } },
  });
  // Si le tag n'est pas cartographie, on n'en fait pas un motif d'incompletude.
  const hasNewSaleTag = newTag ? thread.appliedTags.includes(newTag.discordTagId) : true;

  const week = await prisma.accountingWeek.findFirst({
    where: { guildConfigId: config.id, status: 'OPEN' },
  });

  const verdict = evaluateSubmission({
    authorIsOwner,
    hasNewSaleTag,
    imageCount: images.length,
    quantity,
    weekOpen: Boolean(week),
  });

  if (verdict.status === 'technical_refusal') {
    await thread
      .send(`❌ Refus technique : ${verdict.reasons.join(' ')}`)
      .catch((err) => log.warn({ err }, 'reponse casier KO'));
    await postToLogs(guild, config, {
      content: `${mentionDirection(config)} Refus technique sur <#${thread.id}> : ${verdict.reasons.join(' ')}`,
    });
    await writeAudit(prisma, {
      guildConfigId: config.id,
      action: 'SUBMISSION_TECHNICAL_REFUSAL',
      authorDiscordId: authorId,
      entityType: 'Thread',
      entityId: thread.id,
      reason: verdict.reasons.join(' '),
      correlationId,
    });
    return;
  }

  if (verdict.status === 'incomplete') {
    await setCasierTag(thread, parentId, ForumTagKey.A_COMPLETER);
    const list = verdict.reasons.map((r) => `• ${r}`).join('\n');
    await thread
      .send(
        `⚠️ **Declaration incomplete — statut : A completer.**\n${list}\n\nAucun montant n'est pris en compte tant que ce n'est pas corrige.`,
      )
      .catch((err) => log.warn({ err }, 'reponse casier KO'));
    await writeAudit(prisma, {
      guildConfigId: config.id,
      action: 'SUBMISSION_INCOMPLETE',
      authorDiscordId: authorId,
      entityType: 'Thread',
      entityId: thread.id,
      reason: verdict.reasons.join(' | '),
      correlationId,
    });
    log.info({ reasons: verdict.reasons }, 'Declaration incomplete');
    return;
  }

  if (verdict.status === 'blocked') {
    await thread
      .send(`ℹ️ Reception enregistree. ${verdict.reasons.join(' ')}`)
      .catch((err) => log.warn({ err }, 'reponse casier KO'));
    await postToLogs(guild, config, {
      content: `${mentionDirection(config)} Vente en attente d'ouverture de semaine sur <#${thread.id}>.`,
    });
    await writeAudit(prisma, {
      guildConfigId: config.id,
      action: 'SUBMISSION_BLOCKED_NO_WEEK',
      authorDiscordId: authorId,
      entityType: 'Thread',
      entityId: thread.id,
      correlationId,
    });
    return;
  }

  // ── verdict accepte ────────────────────────────────────────────────────────
  if (quantity === null || !week) return; // garde de typage (deja garanti)

  // Resolution du grade (non bloquante : anomalie signalee a la direction).
  let gradeLabel: string | null = null;
  let gradeRoleId: string | null = null;
  let salaryRate: number | null = null;
  let gradeWarning: string | null = null;
  const member = await guild.members.fetch(authorId).catch(() => null);
  if (!member) {
    gradeWarning = 'Membre introuvable sur le serveur au moment de l’ingestion.';
  } else {
    const grade = await resolveMemberGrade(member, config.id);
    if (grade.selected) {
      gradeLabel = grade.selected.label;
      gradeRoleId = grade.selected.roleId;
      salaryRate = grade.selected.ratePerUnit;
    }
    if (grade.missing) gradeWarning = 'Aucun grade salarial reconnu.';
    else if (grade.ambiguous) {
      gradeWarning = `Plusieurs grades reconnus (${grade.matched.map((m) => m.label).join(', ')}).`;
    }
  }

  // Copie durable des deux preuves (§5.3) — avant toute ecriture en base.
  let stored: StoredAttachment[];
  try {
    stored = await Promise.all(
      [AttachmentType.COFFRE_PLEIN, AttachmentType.COFFRE_VIDE].map((type, i) =>
        downloadAndStore({
          guildId: guild.id,
          threadId: thread.id,
          type,
          messageId: starter.id,
          attachment: images[i]!,
        }),
      ),
    );
  } catch (err) {
    log.error({ err }, 'Copie des preuves echouee — ingestion abandonnee (retentable)');
    await postToLogs(guild, config, {
      content: `${mentionDirection(config)} Echec de copie des preuves sur <#${thread.id}>. A reverifier.`,
    });
    return;
  }

  const result = await persistSale({
    guildConfigId: config.id,
    weekId: week.id,
    employeeId: locker.id,
    threadId: thread.id,
    declaredQuantity: quantity,
    declaredAt: starter.createdAt,
    gradeLabel,
    gradeRoleId,
    salaryRate,
    pnjUnitPrice: config.pnjUnitPrice,
    attachments: stored,
    correlationId,
    authorDiscordId: authorId,
  });

  if (result === 'already_ingested') {
    log.info('Vente deja ingeree (course detectee) — no-op');
    return;
  }

  // Fiche de controle + lien (§4.5). Hors transaction (appels Discord).
  let controlThreadId: string | null = null;
  if (config.channelControl) {
    try {
      const controlChannel = await guild.channels.fetch(config.channelControl);
      if (controlChannel?.type === ChannelType.GuildForum) {
        const controlThread = await createControlPost(
          controlChannel as ForumChannel,
          {
            reference: result.reference,
            nomRP: locker.nomRP,
            gradeLabel,
            salaryRate,
            declaredQuantity: quantity,
            submittedAt: new Date(),
            casierThreadUrl: casierThreadUrl(guild.id, thread.id),
            status: SaleStatus.SOUMISE,
            gradeWarning,
          },
          mentionDirection(config),
        );
        controlThreadId = controlThread.id;
        await prisma.sale.update({
          where: { id: result.saleId },
          data: { controlThreadId },
        });
      } else {
        log.warn('channelControl n’est pas un Forum : fiche de controle non creee');
      }
    } catch (err) {
      log.error({ err }, 'Creation de la fiche de controle echouee (vente enregistree)');
      await postToLogs(guild, config, {
        content: `${mentionDirection(config)} Vente ${result.reference} enregistree mais fiche de controle non creee.`,
      });
    }
  }

  await setCasierTag(thread, parentId, ForumTagKey.A_VERIFIER);
  const note = gradeWarning ? `\n⚠️ ${gradeWarning}` : '';
  await thread
    .send(
      `✅ Reception confirmee — reference **${result.reference}**.\nStatut : A verifier.${note}`,
    )
    .catch((err) => log.warn({ err }, 'reponse casier KO'));

  log.info({ reference: result.reference, controlThreadId }, 'Vente ingeree');
}
