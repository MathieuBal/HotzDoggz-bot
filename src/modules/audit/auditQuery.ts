import { prisma } from '../../infrastructure/database/client.js';

/**
 * Lecture du journal d'audit (CDC §10.3). L'ecriture existait deja partout
 * (writeAudit) mais rien ne la consultait : ce module ferme la boucle pour que
 * la direction puisse enfin lire « qui a fait quoi » (litiges, controle interne,
 * historique d'une vente ou d'un membre).
 */

/** Libelles lisibles des codes d'action (fallback = code brut si inconnu). */
const ACTION_LABELS: Record<string, string> = {
  SALE_INGESTED: '📥 Vente reçue',
  SALE_TAKEN_CHARGE: '👁️ Prise en charge',
  SALE_COMPLEMENT_REQUESTED: '✏️ Complément demandé',
  SALE_REFUSED: '❌ Vente refusée',
  SALE_VALIDATED: '✅ Vente validée',
  SALE_CORRECTED: '🔧 Vente corrigée',
  SALE_CANCELLED_ADMIN: '🗑️ Vente annulée (direction)',
  SALE_RISK_FLAGGED: '🚩 Vente signalée (risque)',
  DIRECT_SALE_CREATED: '📥 Vente directe créée',
  DIRECT_SALE_TAKEN_CHARGE: '👁️ Prise en charge (directe)',
  DIRECT_SALE_REFUSED: '❌ Vente directe refusée',
  DIRECT_SALE_VALIDATED: '✅ Vente directe validée',
  DIRECT_SALE_CANCELLED_ADMIN: '🗑️ Vente directe annulée',
  PAYROLL_PAID: '💵 Paie réglée',
  SALARY_ADVANCE_PAID: '💸 Acompte versé',
  SALARY_ADVANCE_CANCELLED: '↩️ Acompte annulé',
  WEEK_OPENED: '🟢 Semaine ouverte',
  WEEK_CLOSED: '🔒 Semaine clôturée',
  WEEK_CLOSED_FORCED: '🔒 Clôture forcée',
  WEEK_REOPENED: '🔓 Semaine rouverte',
  WEEK_RESET: '♻️ Semaine réinitialisée',
  WEEK_EXPORTED: '📤 Semaine exportée',
  AUDIT_EXPORTED: '📤 Journal exporté',
  ORDER_CREATED: '🧾 Commande créée',
  ORDER_CONTRIBUTION_RECORDED: '🤝 Contribution commande',
  ORDER_DELIVERED: '📦 Commande livrée',
  ORDER_PAID: '💰 Commande encaissée',
  ORDER_CANCELLED: '🗑️ Commande annulée',
  ORDER_CANCELLED_ADMIN: '🗑️ Commande annulée (direction)',
  PARTNER_CREATED: '🏷️ Partenaire créé',
  PARTNER_OBJECTIVE_SET: '🎯 Objectif partenaire',
  PRODUCT_UPSERT: '🍴 Produit menu modifié',
  PRODUCT_DEACTIVATED: '🍴 Produit retiré',
  PNJ_PRICE_SET: '💲 Prix PNJ modifié',
  EMPLOYEE_ASSOCIATED: '👤 Employé associé',
  EMPLOYEE_ARCHIVED: '📁 Employé archivé',
  EMPLOYEE_BRACELET_SET: '🔗 Bracelet réglé',
  CLIENT_VERIFIED: '✅ Règlement accepté',
  CONFIG_ROLES_SET: '⚙️ Rôles configurés',
  CONFIG_CHANNELS_SET: '⚙️ Salons configurés',
  CONFIG_DISTRIBUTION_SET: '⚙️ Répartition modifiée',
  CONFIG_FRAUD_SET: '⚙️ Règles anti-fraude',
  CONFIG_PEREMPTION_SET: '⚙️ Règles péremption',
  CONFIG_REMINDER_SET: '⚙️ Rappel clôture',
  CONFIG_WELCOME_SET: '⚙️ Message d’accueil',
  STORAGE_PURGED: '🧹 Preuves purgées',
};

/** Convertit un code d'action en libelle lisible (ou le code si inconnu). */
export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export interface AuditEntry {
  createdAt: Date;
  action: string;
  authorDiscordId: string | null;
  entityType: string | null;
  entityId: string | null;
  reason: string | null;
  correlationId: string | null;
}

export interface AuditFilter {
  authorDiscordId?: string;
  entityType?: string;
  entityId?: string;
  correlationId?: string;
  limit?: number;
}

const SELECT = {
  createdAt: true,
  action: true,
  authorDiscordId: true,
  entityType: true,
  entityId: true,
  reason: true,
  correlationId: true,
} as const;

const MAX_LIMIT = 25;

/** Derniers evenements du journal d'un serveur, filtrables, les plus recents d'abord. */
export async function queryAudit(
  guildConfigId: string,
  filter: AuditFilter = {},
): Promise<AuditEntry[]> {
  return prisma.auditLog.findMany({
    where: {
      guildConfigId,
      ...(filter.authorDiscordId ? { authorDiscordId: filter.authorDiscordId } : {}),
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.correlationId ? { correlationId: filter.correlationId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(1, filter.limit ?? 15), MAX_LIMIT),
    select: SELECT,
  });
}

/** Une ligne de journal mise en forme pour un embed Discord (timestamp natif). */
export function formatAuditLine(e: AuditEntry): string {
  const ts = `<t:${Math.floor(e.createdAt.getTime() / 1000)}:R>`;
  const who = e.authorDiscordId ? `<@${e.authorDiscordId}>` : '—';
  const reason = e.reason ? ` · _${e.reason.slice(0, 120)}_` : '';
  return `${ts} — **${actionLabel(e.action)}** par ${who}${reason}`;
}

/** Echappe un champ pour le CSV (RFC 4180 : guillemets doubles). */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Construit un CSV exhaustif du journal (export direction). */
export function buildAuditCsv(rows: readonly AuditEntry[]): string {
  const header = [
    'date_iso',
    'action',
    'auteur_discord_id',
    'type_entite',
    'id_entite',
    'motif',
    'correlation_id',
  ];
  const lines = rows.map((r) =>
    [
      r.createdAt.toISOString(),
      r.action,
      r.authorDiscordId ?? '',
      r.entityType ?? '',
      r.entityId ?? '',
      r.reason ?? '',
      r.correlationId ?? '',
    ]
      .map((c) => csvCell(String(c)))
      .join(','),
  );
  return [header.map(csvCell).join(','), ...lines].join('\n');
}

/** Variante non bornee pour l'export (toutes les entrees recentes d'un serveur). */
export async function queryAuditForExport(
  guildConfigId: string,
  max = 5000,
): Promise<AuditEntry[]> {
  return prisma.auditLog.findMany({
    where: { guildConfigId },
    orderBy: { createdAt: 'desc' },
    take: max,
    select: SELECT,
  });
}
