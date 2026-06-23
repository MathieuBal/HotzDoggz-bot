import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { PanelConfirmId } from '../components/ids.js';

/** Encadre + boutons Confirmer/Annuler pour une action a confirmer. */
export function buildConfirmMessage(opts: {
  title: string;
  description: string;
  token: string;
  confirmLabel?: string;
  danger?: boolean;
}): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = new EmbedBuilder()
    .setTitle(opts.title)
    .setDescription(opts.description)
    .setColor(opts.danger ? 0xc0392b : 0xe67e22);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PanelConfirmId.CONFIRM}:${opts.token}`)
      .setLabel(opts.confirmLabel ?? 'Confirmer')
      .setEmoji('✅')
      .setStyle(opts.danger ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${PanelConfirmId.CANCEL}:${opts.token}`)
      .setLabel('Annuler')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}
