import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getEmployeeProfile } from '../../modules/employees/profileService.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

const nf = new Intl.NumberFormat('fr-FR');
const money = (n: number): string => `${nf.format(n)} $`;

export const profilCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('profil')
    .setDescription('Fiche 360 d’un employé (activité, ventes, salaires, promotions)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((o) => o.setName('membre').setDescription('Employé à consulter').setRequired(true))
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const ephemeral = MessageFlags.Ephemeral;
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({ content: 'Serveur requis.', flags: ephemeral });
      return;
    }
    const config = await getGuildConfigByGuildId(interaction.guild.id);
    if (!config) {
      await interaction.reply({ content: 'Configuration absente.', flags: ephemeral });
      return;
    }
    if (!(await isDirection(interaction, config))) {
      await interaction.reply({ content: 'Action réservée à la direction.', flags: ephemeral });
      return;
    }

    await interaction.deferReply({ flags: ephemeral });
    const member = interaction.options.getUser('membre', true);
    const p = await getEmployeeProfile(config.id, member.id);
    if (!p) {
      await interaction.editReply('Aucun employé associé à ce membre.');
      return;
    }

    const since = `<t:${Math.floor(p.since.getTime() / 1000)}:D>`;
    const bracelet = p.multiplier > 1 ? ` · bracelet ×${p.multiplier}` : '';
    const promo = p.lastPromotion ? ` (dernier : ${p.lastPromotion})` : '';

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${p.nomRP}`)
      .setColor(p.active ? 0x3498db : 0x95a5a6)
      .setThumbnail(member.displayAvatarURL())
      .addFields(
        {
          name: 'Statut',
          value: `${p.active ? '🟢 Actif' : '📁 Archivé'} · ${p.gradeLabel ?? 'grade ?'}${bracelet}`,
          inline: true,
        },
        { name: 'Dans l’entreprise depuis', value: since, inline: true },
        { name: 'Promotions', value: `${p.promotions}${promo}`, inline: true },
        {
          name: '🌭 Ventes PNJ validées',
          value: `${p.pnjSalesCount} ventes · ${nf.format(p.pnjUnits)} u · CA ${money(p.pnjRevenue)}`,
          inline: false,
        },
        { name: '🤝 Ventes main-en-main validées', value: String(p.directSalesCount), inline: true },
        { name: '💵 Salaires versés (cumul)', value: money(p.paidTotal), inline: true },
        { name: '🏅 Badges', value: p.badges.length ? p.badges.join(' · ') : '_Aucun pour l’instant_' },
      )
      .setFooter({ text: 'Fiche employé — données cumulées depuis l’embauche.' })
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] });
  },
};
