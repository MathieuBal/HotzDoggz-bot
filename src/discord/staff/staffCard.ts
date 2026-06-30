import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type BaseMessageOptions,
} from 'discord.js';
import type { StaffCard } from '../../modules/employees/staffService.js';
import { StaffButtonId } from '../components/ids.js';

/**
 * Carte detaillee d'un employe (vue direction, ephemere) avec ses actions
 * d'edition. Version enrichie de /profil : ajoute presence serveur, grade lu en
 * direct + anomalies, production de la semaine en cours et prestige.
 */

const nf = new Intl.NumberFormat('fr-FR');
const money = (n: number): string => `${nf.format(n)} $`;
const day = (date: Date): string => `<t:${Math.floor(date.getTime() / 1000)}:D>`;

export function buildStaffCard(card: StaffCard): BaseMessageOptions {
  const color = !card.active ? 0x95a5a6 : !card.onServer ? 0xe67e22 : 0x3498db;

  const embed = new EmbedBuilder()
    .setTitle(`👤 ${card.nomRP}`)
    .setColor(color)
    .setDescription(
      `<@${card.discordUserId}>${card.displayName ? ` — *${card.displayName}*` : ''}`,
    );
  if (card.avatarUrl) embed.setThumbnail(card.avatarUrl);

  const presence = card.onServer ? 'sur le serveur' : '⚠️ a quitté le serveur';
  const statut = `${card.active ? '🟢 Actif' : '📁 Archivé'} · ${presence} · bracelet ×${card.multiplier}`;

  // Grade resolu + drapeaux d'anomalie.
  const gradeParts: string[] = [card.gradeLabel ?? '—'];
  if (card.gradeRate !== null) gradeParts.push(`${card.gradeRate} $/u`);
  if (!card.gradeFromRoles && card.onServer && card.gradeLabel) gradeParts.push('(dernier connu)');
  let gradeValue = gradeParts.join(' · ');
  if (card.ambiguous) {
    gradeValue += `\n⚠️ Plusieurs rôles de grade : ${card.matchedGrades.join(', ')}`;
  }
  if (card.missingGrade) gradeValue += `\n⚠️ Aucun rôle de grade attribué`;

  embed.addFields(
    { name: 'Statut', value: statut },
    { name: 'Grade', value: gradeValue, inline: true },
    { name: 'Depuis', value: day(card.since), inline: true },
    {
      name: 'Promotions',
      value: card.promotions > 0 ? `${card.promotions} (dernier : ${card.lastPromotion ?? '—'})` : 'Aucune',
      inline: true,
    },
  );

  if (card.weekOpen) {
    embed.addFields({
      name: '📅 Semaine en cours',
      value: `${nf.format(card.weekUnits)} u · CA ${money(card.weekRevenue)} · salaire estimé ${money(card.weekSalaryEstimate)}`,
    });
  }

  embed.addFields(
    {
      name: '🌭 Ventes PNJ (cumul)',
      value: `${card.pnjSalesCount} ventes · ${nf.format(card.pnjUnits)} u · ${money(card.pnjRevenue)}`,
    },
    { name: '🤝 Main-en-main', value: `${card.directSalesCount} validées`, inline: true },
    { name: '💵 Salaires versés', value: money(card.paidTotal), inline: true },
  );
  if (card.prestigeLabel) embed.addFields({ name: 'Prestige', value: card.prestigeLabel, inline: true });
  embed.addFields({
    name: `🏅 Badges (${card.badges.length})`,
    value: card.badges.length ? card.badges.join(' · ').slice(0, 1024) : '_Aucun_',
  });
  if (card.casierForumId) embed.addFields({ name: 'Casier', value: `<#${card.casierForumId}>` });

  embed.setFooter({ text: 'Carte direction — grade lu en direct depuis les rôles Discord.' });

  const id = card.employeeId;
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${StaffButtonId.RENAME}:${id}`)
      .setLabel('Renommer')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${StaffButtonId.GRADE}:${id}`)
      .setLabel('Changer de grade')
      .setEmoji('🎖️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${StaffButtonId.BRACELET}:${id}`)
      .setLabel('Bracelet')
      .setEmoji('💪')
      .setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    card.active
      ? new ButtonBuilder()
          .setCustomId(`${StaffButtonId.ARCHIVE}:${id}`)
          .setLabel('Archiver')
          .setEmoji('📦')
          .setStyle(ButtonStyle.Danger)
      : new ButtonBuilder()
          .setCustomId(`${StaffButtonId.REACTIVATE}:${id}`)
          .setLabel('Réactiver')
          .setEmoji('♻️')
          .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${StaffButtonId.RESYNC}:${id}`)
      .setLabel('Resync badges')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${StaffButtonId.REFRESH}:${id}`)
      .setLabel('Rafraîchir')
      .setEmoji('🔁')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}
