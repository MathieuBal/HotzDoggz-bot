import type { GuildMember } from 'discord.js';
import { logger } from '../infrastructure/logging/logger.js';
import { UNIT_BADGES, type BadgeDef } from '../modules/badges/registry.js';

/**
 * Role de prestige : reflet visible (couleur a cote du pseudo) du plus haut
 * palier de PRODUCTION atteint. Geré automatiquement par le bot — il cree le
 * role au besoin, l'attribue, et retire les paliers inferieurs. Best-effort :
 * si le bot manque de « Gerer les roles » ou est trop bas dans la hierarchie,
 * on logge sans casser le flux.
 */

// Couleur par palier (du plus modeste au prestige). Index aligne sur UNIT_BADGES.
const TIER_COLORS = [
  0x95a5a6, // premiere vente — gris
  0xcd7f32, // 100 — bronze
  0xbdc3c7, // 1k — argent
  0xf1c40f, // 10k — or
  0xe67e22, // 50k — orange
  0xe74c3c, // 100k — rouge
  0x9b59b6, // 500k — violet
  0x3498db, // 1M — bleu
  0xffd700, // 2,5M — or vif (G.O.A.T.)
];

const roleName = (def: BadgeDef): string => `${def.emoji} ${def.label}`;
const ALL_PRESTIGE_NAMES = new Set(UNIT_BADGES.map(roleName));

/** Le plus haut badge de production possede (UNIT_BADGES est trie croissant). */
function highestOwned(ownedKeys: ReadonlySet<string>): BadgeDef | undefined {
  let top: BadgeDef | undefined;
  for (const b of UNIT_BADGES) if (ownedKeys.has(b.key)) top = b;
  return top;
}

/**
 * Aligne le role de prestige d'un membre sur son plus haut palier de production.
 * @param ownedProductionKeys cles des badges de production possedes par l'employe.
 */
export async function syncPrestigeRole(
  member: GuildMember,
  ownedProductionKeys: ReadonlySet<string>,
): Promise<void> {
  const top = highestOwned(ownedProductionKeys);
  if (!top) return;

  try {
    const guild = member.guild;
    const targetName = roleName(top);
    const idx = UNIT_BADGES.findIndex((b) => b.key === top.key);
    const wantColor = TIER_COLORS[idx] ?? 0x95a5a6;

    let targetRole = guild.roles.cache.find((r) => r.name === targetName);
    if (!targetRole) {
      targetRole = await guild.roles.create({
        name: targetName,
        // Nouvelle API discord.js : `colors` remplace `color` (deprecie).
        colors: { primaryColor: wantColor },
        hoist: false, // pas de groupe separe dans la sidebar (anti-clutter)
        mentionable: false,
        reason: 'Rôle de prestige HotzDoggz (badge de production)',
      });
    } else if ((targetRole.colors?.primaryColor ?? targetRole.color) !== wantColor) {
      // Le bot gere la palette : on corrige la couleur si elle a derive (ex. role
      // cree avant cette palette). N'edite que si differente (zero appel inutile).
      await targetRole
        .edit({ colors: { primaryColor: wantColor } })
        .catch(() => undefined);
    }

    // Retire les autres roles de prestige (paliers inferieurs deja attribues).
    const toRemove = member.roles.cache.filter(
      (r) => ALL_PRESTIGE_NAMES.has(r.name) && r.id !== targetRole?.id,
    );
    for (const r of toRemove.values()) {
      await member.roles.remove(r, 'Montee de palier de prestige').catch(() => undefined);
    }
    if (targetRole && !member.roles.cache.has(targetRole.id)) {
      await member.roles.add(targetRole, 'Palier de prestige atteint').catch(() => undefined);
    }
  } catch (err) {
    logger.warn(
      { err, memberId: member.id },
      'Sync du rôle de prestige KO (permission « Gérer les rôles » ou hiérarchie ?)',
    );
  }
}

/** Vrai si la cle de badge appartient a la famille production (drive le prestige). */
export function isProductionBadgeKey(key: string): boolean {
  return UNIT_BADGES.some((b) => b.key === key);
}
