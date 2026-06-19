import { prisma } from '../../infrastructure/database/client.js';

export interface GradeResolutionInput {
  guildConfigId: string;
  employeeId: string;
  roleId: string;
  label: string;
  rate: number;
}

/**
 * Met a jour le dernier grade connu d'un employe et journalise tout changement
 * (CDC §7 : evolutions). Alimente le tableau "Developpement de l'entreprise".
 *
 * - Premier grade connu (ancien = null) : enregistre, mais ce n'est pas une
 *   promotion (c'est l'embauche / la decouverte du grade).
 * - Changement de role : cree un EmployeeGradeEvent (promotion si le tarif monte).
 *
 * Garde optimiste (updateMany sur l'ancien roleId) : deux ventes simultanees du
 * meme employe ne creent pas deux fois le meme evenement.
 */
export async function recordGradeResolution(input: GradeResolutionInput): Promise<void> {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { lastGradeRoleId: true, lastGradeLabel: true, lastGradeRate: true },
  });
  if (!employee) return;
  if (employee.lastGradeRoleId === input.roleId) return; // aucun changement

  // Pose le nouveau grade en garde sur l'ancien : si une autre ingestion l'a
  // deja fait entre-temps, on n'ecrit pas l'evenement en double.
  const upd = await prisma.employee.updateMany({
    where: { id: input.employeeId, lastGradeRoleId: employee.lastGradeRoleId },
    data: {
      lastGradeRoleId: input.roleId,
      lastGradeLabel: input.label,
      lastGradeRate: input.rate,
    },
  });
  if (upd.count !== 1) return; // course perdue : l'autre ingestion s'en est chargee

  await prisma.employeeGradeEvent.create({
    data: {
      guildConfigId: input.guildConfigId,
      employeeId: input.employeeId,
      fromLabel: employee.lastGradeLabel,
      fromRate: employee.lastGradeRate,
      toLabel: input.label,
      toRate: input.rate,
      roleId: input.roleId,
    },
  });
}
