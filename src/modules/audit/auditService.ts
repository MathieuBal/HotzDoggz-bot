import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Journal d'audit (CDC §10.3) : aucune action sensible sans trace.
 * Accepte un client Prisma ou un client de transaction pour s'inscrire dans
 * la meme transaction que l'operation auditee (§9.4).
 */
export interface AuditInput {
  guildConfigId?: string | null;
  action: string;
  authorDiscordId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  channelId?: string | null;
  correlationId?: string | null;
}

function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

export async function writeAudit(db: Db, input: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      guildConfigId: input.guildConfigId ?? null,
      action: input.action,
      authorDiscordId: input.authorDiscordId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      before: asJson(input.before),
      after: asJson(input.after),
      reason: input.reason ?? null,
      channelId: input.channelId ?? null,
      correlationId: input.correlationId ?? null,
    },
  });
}
