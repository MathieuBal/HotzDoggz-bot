import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getTreasury } from '../../modules/accounting/treasuryService.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

const nf = new Intl.NumberFormat('fr-FR');
const money = (n: number): string => `${nf.format(n)} $`;

export const tresorerieCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('tresorerie')
    .setDescription('Récapitulatif financier cumulé de l’entreprise')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
    const t = await getTreasury(config.id);

    const adj = t.adjustments !== 0 ? `\nAjustements : **${money(t.adjustments)}**` : '';
    const embed = new EmbedBuilder()
      .setTitle('💰 Trésorerie HotzDoggz — cumul depuis le début')
      .setColor(t.cashFlow >= 0 ? 0x2ecc71 : 0xcc0000)
      .addFields(
        {
          name: '🟢 Encaissé',
          value: `CA : **${money(t.revenue)}**${adj}`,
          inline: true,
        },
        {
          name: '🔴 Versé aux employés',
          value: `Salaires + acomptes : **${money(t.payments)}**`,
          inline: true,
        },
        {
          name: '⚖️ Flux de caisse net',
          value: `**${money(t.cashFlow)}**\n_(encaissé − versé)_`,
          inline: true,
        },
        {
          name: '— Répartition du bénéfice (cumul, pour info) —',
          value:
            `Réserve de sécurité : **${money(t.reserve)}**\n` +
            `Prime employés : **${money(t.bonus)}**\n` +
            `Parts direction : **${money(t.direction)}**`,
        },
      )
      .setFooter({
        text: 'Le flux net ne compte que les versements aux employés ; les retraits de dividendes en jeu ne sont pas tracés.',
      })
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] });
  },
};
