/**
 * Determination du grade salarial d'un employe a partir de ses roles Discord
 * (CDC §5.2). On lit les roles reconnus et on choisit le grade salarial valide
 * le plus eleve ; on signale les configurations incoherentes (§11).
 *
 * Le rôle Discord est la source ; un snapshot est ensuite fige sur la vente
 * (§14 : "Role Discord + snapshot en vente + detection des incoherences").
 */

export interface GradeRateRef {
  roleId: string;
  label: string;
  ratePerUnit: number;
}

export interface GradeResolution {
  /** Tous les roles de grade reconnus que possede le membre. */
  matched: GradeRateRef[];
  /** Le grade retenu (tarif le plus eleve), ou null si aucun. */
  selected: GradeRateRef | null;
  /** Plusieurs grades reconnus simultanement => a verifier par la direction. */
  ambiguous: boolean;
  /** Aucun grade reconnu => anomalie a signaler. */
  missing: boolean;
}

/**
 * @param memberRoleIds  IDs des roles Discord du membre.
 * @param gradeRates     Tarifs actifs connus (un par role de grade).
 */
export function resolveGrade(
  memberRoleIds: readonly string[],
  gradeRates: readonly GradeRateRef[],
): GradeResolution {
  const roleSet = new Set(memberRoleIds);
  const matched = gradeRates.filter((g) => roleSet.has(g.roleId));

  if (matched.length === 0) {
    return { matched, selected: null, ambiguous: false, missing: true };
  }

  // Tarif le plus eleve = grade le plus eleve (grille croissante 145 -> 185).
  const selected = matched.reduce((best, current) =>
    current.ratePerUnit > best.ratePerUnit ? current : best,
  );

  return {
    matched,
    selected,
    ambiguous: matched.length > 1,
    missing: false,
  };
}
