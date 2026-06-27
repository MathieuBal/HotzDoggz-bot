import { type SaleStatus } from '@prisma/client';
import { type Client, type ThreadChannel } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { setCasierTag } from '../../modules/lockers/casierTags.js';
import {
  refreshControlFiche,
  type ControlFicheData,
} from '../../modules/verification/controlPost.js';
import { casierTagFor } from '../../modules/sales/statusLabels.js';

function casierThreadUrl(guildId: string, threadId: string): string {
  return `https://discord.com/channels/${guildId}/${threadId}`;
}

/** Reconstruit les donnees d'affichage de la fiche depuis la vente en base. */
export async function loadFicheData(
  saleId: string,
  guildId: string,
): Promise<ControlFicheData | null> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { employee: { select: { nomRP: true } } },
  });
  if (!sale) return null;
  return {
    reference: sale.reference,
    nomRP: sale.employee.nomRP,
    gradeLabel: sale.gradeSnapshot,
    salaryRate: sale.salaryRateSnapshot,
    declaredQuantity: sale.declaredQuantity,
    submittedAt: sale.submittedAt,
    casierThreadUrl: casierThreadUrl(guildId, sale.threadId),
    status: sale.status,
    controllerId: sale.controllerDiscordId,
    validatedQuantity: sale.validatedQuantity,
    riskLevel: sale.riskLevel,
    riskReasons: sale.riskReasons,
  };
}

/** Rafraichit la fiche de controle (embed + boutons) depuis l'etat en base. */
export async function refreshFiche(
  controlThread: ThreadChannel,
  saleId: string,
  guildId: string,
): Promise<void> {
  const data = await loadFicheData(saleId, guildId);
  if (data) {
    await refreshControlFiche(controlThread, data).catch((err) =>
      logger.warn({ err, saleId }, 'Rafraichissement de la fiche KO'),
    );
  }
}

/**
 * Range la fiche d'une vente close (validee) hors de la vue active du forum de
 * controle, pour eviter l'accumulation de threads a faire defiler. On *archive*
 * plutot que de supprimer : aucune donnee perdue, et un clic sur « Corriger »
 * fait reapparaitre le thread automatiquement (Discord le desarchive a
 * l'interaction). L'archivage est best-effort : il ne doit jamais faire echouer
 * l'action de direction deja committee en base.
 *
 * Important : toujours appeler APRES refreshFiche — editer le message starter
 * desarchiverait le thread juste apres l'avoir range.
 */
export async function archiveFiche(controlThread: ThreadChannel, saleId: string): Promise<void> {
  if (controlThread.archived) return;
  await controlThread
    .setArchived(true, 'Vente validee — fiche rangee automatiquement')
    .catch((err) => logger.warn({ err, saleId }, 'Archivage de la fiche KO'));
}

/** Applique le tag de statut au casier et y publie un message a l'employe. */
export async function applyCasierEffects(
  client: Client,
  params: {
    threadId: string;
    casierForumId: string | null;
    status: SaleStatus;
    message: string;
  },
): Promise<void> {
  const channel = await client.channels.fetch(params.threadId).catch(() => null);
  if (!channel || !channel.isThread()) return;
  const thread = channel;

  const tagKey = casierTagFor(params.status);
  if (tagKey && params.casierForumId) {
    await setCasierTag(thread, params.casierForumId, tagKey);
  }
  await thread.send(params.message).catch((err) => logger.warn({ err }, 'reponse casier KO'));
}
