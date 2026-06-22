import { LedgerEntryType, SalaryAdvanceStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../audit/auditService.js';
import { getOpenWeekSnapshot } from '../accounting/accountingService.js';
import { personalView } from '../accounting/weekReport.js';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface AdvanceCapacity {
  weekId: string;
  earned: number; // salaire deja gagne cette semaine (ventes validees x taux)
  alreadyAdvanced: number; // somme des avances ACTIVE de la semaine
  remaining: number; // ce qu'on peut encore avancer (>= 0)
}

/** Somme des avances actives d'un employe sur une semaine. */
async function sumActiveAdvances(weekId: string, employeeId: string): Promise<number> {
  const agg = await prisma.salaryAdvance.aggregate({
    where: { weekId, employeeId, status: SalaryAdvanceStatus.ACTIVE },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/** Capacite d'avance d'un employe sur la semaine ouverte (null si pas de semaine). */
export async function getAdvanceCapacity(
  guildConfigId: string,
  employeeId: string,
): Promise<AdvanceCapacity | null> {
  const snapshot = await getOpenWeekSnapshot(guildConfigId);
  if (!snapshot) return null;
  const earned = personalView(snapshot.report, employeeId).salary;
  const alreadyAdvanced = await sumActiveAdvances(snapshot.week.id, employeeId);
  return {
    weekId: snapshot.week.id,
    earned,
    alreadyAdvanced,
    remaining: Math.max(0, earned - alreadyAdvanced),
  };
}

export interface RecordedAdvance {
  id: string;
  amount: number;
  remainingAfter: number;
}

/**
 * Enregistre une avance (direction) : plafonnee a ce que l'employe a deja gagne
 * cette semaine. Cree la ligne d'avance + une sortie au journal (paiement
 * anticipe), le tout audite. Re-verifie le plafond dans la transaction.
 */
export async function recordAdvance(params: {
  guildConfigId: string;
  employeeId: string;
  nomRP: string;
  amount: number;
  byDiscordId: string;
  note?: string | null;
}): Promise<ActionResult<RecordedAdvance>> {
  const { guildConfigId, employeeId, amount, byDiscordId } = params;
  if (!Number.isInteger(amount) || amount < 1) {
    return { ok: false, reason: 'Le montant doit être un entier positif.' };
  }
  const cap = await getAdvanceCapacity(guildConfigId, employeeId);
  if (!cap) return { ok: false, reason: 'Aucune semaine ouverte.' };
  if (cap.earned === 0) {
    return { ok: false, reason: `${params.nomRP} n’a encore rien gagné cette semaine.` };
  }
  if (amount > cap.remaining) {
    return {
      ok: false,
      reason: `Plafond dépassé : ${params.nomRP} a gagné ${cap.earned} $ (déjà avancé ${cap.alreadyAdvanced} $). Avance possible : ${cap.remaining} $.`,
    };
  }

  return prisma.$transaction(async (tx) => {
    // Re-verification du plafond dans la transaction (anti-course).
    const already = await tx.salaryAdvance.aggregate({
      where: { weekId: cap.weekId, employeeId, status: SalaryAdvanceStatus.ACTIVE },
      _sum: { amount: true },
    });
    const advanced = already._sum.amount ?? 0;
    if (amount > Math.max(0, cap.earned - advanced)) {
      return { ok: false as const, reason: 'Plafond dépassé entre-temps. Réessaie.' };
    }
    const advance = await tx.salaryAdvance.create({
      data: {
        guildConfigId,
        weekId: cap.weekId,
        employeeId,
        amount,
        note: params.note ?? null,
        createdByDiscordId: byDiscordId,
      },
    });
    await tx.ledgerEntry.create({
      data: {
        guildConfigId,
        type: LedgerEntryType.PAYMENT,
        amount,
        weekId: cap.weekId,
        employeeId,
        description: `Avance sur salaire ${params.nomRP}`,
      },
    });
    await writeAudit(tx, {
      guildConfigId,
      action: 'SALARY_ADVANCE_PAID',
      authorDiscordId: byDiscordId,
      entityType: 'SalaryAdvance',
      entityId: advance.id,
      after: { amount, employeeId },
    });
    return {
      ok: true as const,
      data: { id: advance.id, amount, remainingAfter: Math.max(0, cap.earned - advanced - amount) },
    };
  });
}

export interface AdvanceLine {
  employeeId: string;
  nomRP: string;
  advanced: number;
}

/** Avances actives de la semaine ouverte, par employe. */
export async function listOpenWeekAdvances(guildConfigId: string): Promise<AdvanceLine[]> {
  const snapshot = await getOpenWeekSnapshot(guildConfigId);
  if (!snapshot) return [];
  const rows = await prisma.salaryAdvance.findMany({
    where: { weekId: snapshot.week.id, status: SalaryAdvanceStatus.ACTIVE },
    include: { employee: { select: { nomRP: true } } },
  });
  const byEmp = new Map<string, AdvanceLine>();
  for (const r of rows) {
    const cur = byEmp.get(r.employeeId) ?? {
      employeeId: r.employeeId,
      nomRP: r.employee.nomRP,
      advanced: 0,
    };
    cur.advanced += r.amount;
    byEmp.set(r.employeeId, cur);
  }
  return [...byEmp.values()].sort((a, b) => b.advanced - a.advanced);
}

/** Annule la derniere avance active d'un employe sur la semaine ouverte. */
export async function cancelLastAdvance(
  guildConfigId: string,
  employeeId: string,
  nomRP: string,
  byDiscordId: string,
): Promise<ActionResult<{ amount: number }>> {
  const snapshot = await getOpenWeekSnapshot(guildConfigId);
  if (!snapshot) return { ok: false, reason: 'Aucune semaine ouverte.' };

  return prisma.$transaction(async (tx) => {
    const last = await tx.salaryAdvance.findFirst({
      where: { weekId: snapshot.week.id, employeeId, status: SalaryAdvanceStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
    if (!last) return { ok: false as const, reason: `Aucune avance active pour ${nomRP}.` };

    await tx.salaryAdvance.update({
      where: { id: last.id },
      data: {
        status: SalaryAdvanceStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledByDiscordId: byDiscordId,
      },
    });
    // Contre-passation au journal (l'avance n'a plus de sortie).
    await tx.ledgerEntry.create({
      data: {
        guildConfigId,
        type: LedgerEntryType.ADJUSTMENT,
        amount: -last.amount,
        weekId: snapshot.week.id,
        employeeId,
        description: `Annulation avance ${nomRP}`,
      },
    });
    await writeAudit(tx, {
      guildConfigId,
      action: 'SALARY_ADVANCE_CANCELLED',
      authorDiscordId: byDiscordId,
      entityType: 'SalaryAdvance',
      entityId: last.id,
      before: { amount: last.amount },
    });
    return { ok: true as const, data: { amount: last.amount } };
  });
}
