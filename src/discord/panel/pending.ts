import { randomUUID } from 'node:crypto';

/**
 * Actions critiques en attente de confirmation (modif de prix, retrait,
 * archivage). On garde le contexte cote serveur, indexe par un jeton court
 * appose au customId du bouton, plutot que d'encoder des donnees libres
 * (noms avec accents/`:`) dans le customId.
 */
export type PendingAction =
  | { kind: 'menu_price'; guildConfigId: string; name: string; price: number; oldPrice: number | null }
  | { kind: 'pnj_price'; guildConfigId: string; price: number; oldPrice: number }
  | { kind: 'menu_remove'; guildConfigId: string; productId: string; name: string }
  | { kind: 'archive'; guildConfigId: string; discordUserId: string; nomRP: string };

interface Entry {
  userId: string;
  action: PendingAction;
  expiresAt: number;
}

const store = new Map<string, Entry>();
const TTL_MS = 5 * 60_000;

/** Enregistre une action a confirmer et renvoie son jeton. */
export function putPending(userId: string, action: PendingAction): string {
  const token = randomUUID().slice(0, 12);
  store.set(token, { userId, action, expiresAt: Date.now() + TTL_MS });
  if (store.size > 200) {
    const now = Date.now();
    for (const [k, v] of store) if (v.expiresAt < now) store.delete(k);
  }
  return token;
}

/** Consomme un jeton (usage unique). Null si inconnu, expire ou mauvais auteur. */
export function takePending(token: string, userId: string): PendingAction | null {
  const entry = store.get(token);
  if (!entry) return null;
  store.delete(token);
  if (entry.userId !== userId || entry.expiresAt < Date.now()) return null;
  return entry.action;
}
