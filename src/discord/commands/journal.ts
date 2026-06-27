import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { formatAuditLine, queryAudit } from '../../modules/audit/auditQuery.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

const EMBED_COLOR = 0x34495e;

function render(title: string, lines: string[]): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(EMBED_COLOR)
    .setDescription(lines.length ? lines.join('\n') : '_Aucun évènement._')
    .setFooter({ text: 'Journal d’audit — lecture réservée à la direction.' })
    .setTimestamp(new Date());
}

export const journalCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('journal')
    .setDescription('Journal d’audit : qui a fait quoi')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('recent')
        .setDescription('Derniers évènements du serveur')
        .addIntegerOption((o) =>
          o.setName('limite').setDescription('Nombre d’entrées (max 25)').setMinValue(1).setMaxValue(25),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('membre')
        .setDescription('Actions effectuées par un membre de la direction')
        .addUserOption((o) => o.setName('membre').setDescription('Auteur des actions').setRequired(true))
        .addIntegerOption((o) =>
          o.setName('limite').setDescription('Nombre d’entrées (max 25)').setMinValue(1).setMaxValue(25),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('vente')
        .setDescription('Historique complet d’une vente (par référence)')
        .addStringOption((o) =>
          o.setName('reference').setDescription('Ex. HD-2026-0042 ou VD-2026-0007').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('transaction')
        .setDescription('Toutes les écritures d’une même transaction (correlationId)')
        .addStringOption((o) =>
          o.setName('id').setDescription('Identifiant de corrélation').setRequired(true),
        ),
    )
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
    const sub = interaction.options.getSubcommand();

    if (sub === 'recent') {
      const limit = interaction.options.getInteger('limite') ?? 15;
      const rows = await queryAudit(config.id, { limit });
      await interaction.editReply({
        embeds: [render('🗂️ Journal — derniers évènements', rows.map(formatAuditLine))],
      });
      return;
    }

    if (sub === 'membre') {
      const member = interaction.options.getUser('membre', true);
      const limit = interaction.options.getInteger('limite') ?? 15;
      const rows = await queryAudit(config.id, { authorDiscordId: member.id, limit });
      await interaction.editReply({
        embeds: [render(`🗂️ Journal — actions de ${member.username}`, rows.map(formatAuditLine))],
      });
      return;
    }

    if (sub === 'transaction') {
      const id = interaction.options.getString('id', true).trim();
      const rows = await queryAudit(config.id, { correlationId: id, limit: 25 });
      const lines = [...rows].reverse().map(formatAuditLine); // chronologique
      await interaction.editReply({
        embeds: [render(`🗂️ Transaction ${id.slice(0, 8)}…`, lines)],
      });
      return;
    }

    // sub === 'vente' : resout la reference (vente PNJ ou directe) puis liste son
    // historique chronologique.
    const reference = interaction.options.getString('reference', true).trim().toUpperCase();
    const [sale, direct] = await Promise.all([
      prisma.sale.findFirst({ where: { guildConfigId: config.id, reference }, select: { id: true } }),
      prisma.directSale.findFirst({
        where: { guildConfigId: config.id, reference },
        select: { id: true },
      }),
    ]);
    const entityId = sale?.id ?? direct?.id;
    if (!entityId) {
      await interaction.editReply(`Aucune vente trouvée pour la référence « ${reference} ».`);
      return;
    }
    const rows = await queryAudit(config.id, { entityId, limit: 25 });
    // Du plus ancien au plus recent : on lit la vie de la vente dans l'ordre.
    const lines = [...rows].reverse().map(formatAuditLine);
    await interaction.editReply({ embeds: [render(`🗂️ Historique — ${reference}`, lines)] });
  },
};
