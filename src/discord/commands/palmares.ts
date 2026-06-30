import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import {
  checkAndAwardBadges,
  checkAndAwardContributionBadges,
  listEmployeeBadges,
} from '../../modules/badges/badgeService.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { isDirection } from '../permissions.js';
import { syncPrestigeRole } from '../prestige.js';
import type { SlashCommand } from './types.js';

export const palmaresCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('palmares')
    .setDescription('Badges & prestige (direction)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('resync')
        .setDescription('Attribue à tous les employés les badges déjà mérités + leur rôle de prestige'),
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

    const employees = await prisma.employee.findMany({
      where: { guildConfigId: config.id, status: 'ACTIVE' },
      select: { id: true, discordUserId: true },
    });

    let awarded = 0;
    let rolesSynced = 0;
    for (const e of employees) {
      const fresh = [
        ...(await checkAndAwardBadges(config.id, e.id)),
        ...(await checkAndAwardContributionBadges(config.id, e.id)),
      ];
      awarded += fresh.length;
      const member = await interaction.guild.members.fetch(e.discordUserId).catch(() => null);
      if (member) {
        const owned = new Set((await listEmployeeBadges(e.id)).map((b) => b.key));
        await syncPrestigeRole(member, owned);
        rolesSynced++;
      }
    }

    await interaction.editReply(
      `✅ Resync terminé : **${awarded}** badge(s) attribué(s) sur **${employees.length}** employé(s), ` +
        `${rolesSynced} rôle(s) de prestige synchronisé(s).`,
    );
  },
};
