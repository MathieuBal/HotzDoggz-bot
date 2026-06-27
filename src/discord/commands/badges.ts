import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { listEmployeeBadges } from '../../modules/badges/badgeService.js';
import {
  CONTRIBUTION_BADGES,
  REVENUE_BADGES,
  SPECIAL_BADGES,
  UNIT_BADGES,
  type BadgeDef,
} from '../../modules/badges/registry.js';
import {
  getEmployeeByDiscordId,
  getGuildConfigByGuildId,
} from '../../modules/employees/employeeService.js';
import type { SlashCommand } from './types.js';

const nf = new Intl.NumberFormat('fr-FR');

function section(defs: readonly BadgeDef[], earned: Set<string>, unit: string): string {
  return defs
    .map((b) => {
      const mark = earned.has(b.key) ? '✅' : '⬜';
      const goal = b.threshold > 0 ? ` _(${nf.format(b.threshold)} ${unit})_` : '';
      return `${mark} ${b.emoji} **${b.label}**${goal}`;
    })
    .join('\n');
}

export const badgesCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('badges')
    .setDescription('Tes badges et les prochains paliers à viser')
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
    const employee = await getEmployeeByDiscordId(interaction.user.id);
    if (!employee || employee.guildConfigId !== config.id) {
      await interaction.reply({
        content: 'Tu n’es pas enregistré comme employé.',
        flags: ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: ephemeral });
    const earned = new Set((await listEmployeeBadges(employee.id)).map((b) => b.key));
    const total =
      UNIT_BADGES.length +
      REVENUE_BADGES.length +
      CONTRIBUTION_BADGES.length +
      SPECIAL_BADGES.length;

    const embed = new EmbedBuilder()
      .setTitle(`🏅 Tes badges — ${employee.nomRP}`)
      .setColor(0x9b59b6)
      .setDescription(`Débloqués : **${earned.size}/${total}**`)
      .addFields(
        { name: '🌭 Production (ventes PNJ)', value: section(UNIT_BADGES, earned, 'u') },
        { name: '💰 Chiffre d’affaires généré', value: section(REVENUE_BADGES, earned, '$') },
        { name: '🤝 Contributions commandes', value: section(CONTRIBUTION_BADGES, earned, 'contrib.') },
        { name: '⭐ Spéciaux', value: section(SPECIAL_BADGES, earned, '') },
      )
      .setFooter({ text: '⬜ = à débloquer. Continue, ça va tomber ! 🌭' })
      .setTimestamp(new Date());
    await interaction.editReply({ embeds: [embed] });
  },
};
