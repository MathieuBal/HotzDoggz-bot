import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ForumChannel,
  type ThreadChannel,
} from 'discord.js';

/** Donnees affichees sur la fiche de controle (CDC §4.5). */
export interface ControlFicheData {
  reference: string;
  nomRP: string;
  gradeLabel: string | null;
  salaryRate: number | null;
  declaredQuantity: number;
  submittedAt: Date;
  casierThreadUrl: string;
  gradeWarning?: string | null;
}

function formatDate(d: Date): string {
  return d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
}

export function buildControlEmbed(data: ControlFicheData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`VENTE ${data.reference} — ${data.nomRP} — ${data.declaredQuantity} produits`)
    .setColor(0xff7a00)
    .addFields(
      { name: 'Employe', value: data.nomRP, inline: true },
      { name: 'Grade declare', value: data.gradeLabel ?? '— (a verifier)', inline: true },
      {
        name: 'Tarif instantane',
        value: data.salaryRate !== null ? `${data.salaryRate} $` : '—',
        inline: true,
      },
      { name: 'Quantite declaree', value: String(data.declaredQuantity), inline: true },
      { name: 'Date de soumission', value: formatDate(data.submittedAt), inline: true },
      { name: 'Statut', value: 'Nouvelle', inline: true },
    );

  if (data.gradeWarning) {
    embed.addFields({ name: '⚠️ Anomalie de grade', value: data.gradeWarning });
  }
  return embed;
}

/** Bouton lien vers le post du casier (sans handler ; boutons d'action en Phase 3). */
function buildLinkRow(casierThreadUrl: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Ouvrir le post du casier')
      .setURL(casierThreadUrl),
  );
}

/**
 * Cree la fiche de controle dans le Forum prive de controle (CDC §4.5).
 * @param mentionContent mention de la direction (une seule fois, §5.6).
 */
export async function createControlPost(
  controlForum: ForumChannel,
  data: ControlFicheData,
  mentionContent: string,
): Promise<ThreadChannel> {
  const thread = await controlForum.threads.create({
    name: `${data.reference} — ${data.nomRP}`,
    message: {
      content: mentionContent || undefined,
      embeds: [buildControlEmbed(data)],
      components: [buildLinkRow(data.casierThreadUrl)],
    },
  });
  return thread;
}
