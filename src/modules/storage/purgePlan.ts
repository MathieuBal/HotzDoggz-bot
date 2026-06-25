/**
 * Plan de purge du stockage des preuves (CDC §5.3 / §10.4) — fonction PURE,
 * donc testable sans I/O.
 *
 * Regle : une preuve image (facture, photo de coffre, preuve de paiement) est
 * une copie d'audit utile pendant la fenetre de validation, pas eternellement.
 * Pour eviter de saturer le disque, tout objet plus vieux que la retention est
 * supprime — SAUF les assets durables encore referencees (photos du menu et des
 * vehicules), qui doivent rester tant que l'entite existe.
 */

export interface PurgeableObject {
  key: string;
  size: number;
  modifiedAt: Date;
}

export interface PurgePlan {
  /** Cles a supprimer (trop vieilles et non protegees). */
  keys: string[];
  /** Octets liberes par la suppression. */
  bytes: number;
  /** Objets conserves (protege ou recent). */
  kept: number;
}

/**
 * Determine quels objets supprimer : plus vieux que `cutoff` ET non proteges.
 *
 * @param objects       inventaire complet du stockage.
 * @param cutoff        date limite : tout ce qui est modifie AVANT est candidat.
 * @param protectedKeys cles a ne jamais supprimer (assets durables references).
 */
export function planPurge(
  objects: readonly PurgeableObject[],
  cutoff: Date,
  protectedKeys: ReadonlySet<string>,
): PurgePlan {
  const cutoffMs = cutoff.getTime();
  const keys: string[] = [];
  let bytes = 0;
  let kept = 0;
  for (const obj of objects) {
    const expired = obj.modifiedAt.getTime() < cutoffMs;
    if (expired && !protectedKeys.has(obj.key)) {
      keys.push(obj.key);
      bytes += obj.size;
    } else {
      kept++;
    }
  }
  return { keys, bytes, kept };
}
