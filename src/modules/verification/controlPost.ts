import { SaleStatus } from '@prisma/client';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ForumChannel,
  type ThreadChannel,
} from 'discord.js';
import { SaleButtonId } from '../../discord/components/ids.js';
import { controlLabel } from '../sales/statusLabels.js';

/** Donnees affichees sur la fiche de controle (CDC §4.5). */
export interface ControlFicheData {
  reference: string;
  nomRP: string;
  gradeLabel: string | null;
  salaryRate: number | null;
  declaredQuantity: number;
  submittedAt: Date;
  casierThreadUrl: string;
  status: SaleStatus;
  controllerId?: string | null;
  validatedQuantity?: number | null;
  gradeWarning?: string | null;
}

function formatDate(d: Date): string {
  return d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
}

export function buildControlEmbed(data: ControlFicheData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`VENTE ${data.reference} — ${data.nomRP} — ${data.declaredQuantity} produits`)
    .setColor(data.status === SaleStatus.REFUSEE ? 0xcc0000 : 0xff7a00)
    .addFields(
      { name: 'Employe', value: data.nomRP, inline: true },
      { name: 'Grade declare', value: data.gradeLabel ?? '— (a verifier)', inline: true },
      {
        name: 'Tarif instantane',
        value: data.salaryRate !== null ? `${data.salaryRate} $` : '—',
        inline: true,
      },
      { name: 'Quantite declaree', value: String(data.declaredQuantity), inline: true },
      {
        name: 'Quantite validee',
        value: data.validatedQuantity != null ? String(data.validatedQuantity) : '—',
        inline: true,
      },
      { name: 'Statut', value: controlLabel(data.status), inline: true },
      { name: 'Date de soumission', value: formatDate(data.submittedAt), inline: true },
      {
        name: 'Pris en charge par',
        value: data.controllerId ? `<@${data.controllerId}>` : '—',
        inline: true,
      },
    );

  if (
    data.status === SaleStatus.VALIDEE &&
    data.salaryRate != null &&
    data.validatedQuantity != null
  ) {
    embed.addFields({
      name: 'Salaire calcule',
      value: `${data.validatedQuantity * data.salaryRate} $`,
      inline: true,
    });
  }
  if (data.gradeWarning) {
    embed.addFields({ name: '⚠️ Anomalie de grade', value: data.gradeWarning });
  }
  return embed;
}

const ENABLED: Record<SaleStatus, Set<string>> = {
  [SaleStatus.SOUMISE]: new Set([
    SaleButtonId.TAKE,
    SaleButtonId.COMPLEMENT,
    SaleButtonId.VALIDATE,
    SaleButtonId.REFUSE,
  ]),
  [SaleStatus.EN_VERIFICATION]: new Set([
    SaleButtonId.COMPLEMENT,
    SaleButtonId.VALIDATE,
    SaleButtonId.REFUSE,
  ]),
  [SaleStatus.INCOMPLETE]: new Set([
    SaleButtonId.TAKE,
    SaleButtonId.COMPLEMENT,
    SaleButtonId.VALIDATE,
    SaleButtonId.REFUSE,
  ]),
  [SaleStatus.VALIDEE]: new Set([SaleButtonId.CORRECT]),
  [SaleStatus.INTEGREE_A_LA_PAIE]: new Set(),
  [SaleStatus.PAYEE]: new Set(),
  [SaleStatus.REFUSEE]: new Set(),
  [SaleStatus.ANNULEE]: new Set(),
};

/** Boutons d'action de la fiche, actives selon le statut courant (§7.2). */
export function buildControlComponents(
  data: Pick<ControlFicheData, 'status' | 'casierThreadUrl'>,
): ActionRowBuilder<ButtonBuilder>[] {
  const enabled = ENABLED[data.status];
  const btn = (id: string, label: string, style: ButtonStyle): ButtonBuilder =>
    new ButtonBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setDisabled(!enabled.has(id));

  const link = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel('Ouvrir le casier')
    .setURL(data.casierThreadUrl);

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      link,
      btn(SaleButtonId.TAKE, 'Prendre en charge', ButtonStyle.Primary),
      btn(SaleButtonId.COMPLEMENT, 'Demander complement', ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      btn(SaleButtonId.VALIDATE, 'Valider', ButtonStyle.Success),
      btn(SaleButtonId.REFUSE, 'Refuser', ButtonStyle.Danger),
      btn(SaleButtonId.CORRECT, 'Corriger', ButtonStyle.Secondary),
    ),
  ];
}

/** Cree la fiche de controle dans le Forum prive de controle (CDC §4.5). */
export async function createControlPost(
  controlForum: ForumChannel,
  data: ControlFicheData,
  mentionContent: string,
): Promise<ThreadChannel> {
  return controlForum.threads.create({
    name: `${data.reference} — ${data.nomRP}`,
    message: {
      content: mentionContent || undefined,
      embeds: [buildControlEmbed(data)],
      components: buildControlComponents(data),
    },
  });
}

/** Rafraichit la fiche (embed + boutons) apres une action direction. */
export async function refreshControlFiche(
  thread: ThreadChannel,
  data: ControlFicheData,
): Promise<void> {
  const starter = await thread.fetchStarterMessage();
  if (!starter) return;
  await starter.edit({
    embeds: [buildControlEmbed(data)],
    components: buildControlComponents(data),
  });
}
