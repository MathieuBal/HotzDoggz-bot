import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import { isDirection } from '../permissions.js';
import { publishVerification } from '../verification/verificationBoard.js';
import type { SlashCommand } from './types.js';

/** Gestion du sas d'acces (direction) : republier le bouton, ouvrir l'acces aux deja-presents. */
export const accesCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('acces')
    .setDescription('Sas d’accès : règlement & rôle Client (direction)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('publier').setDescription('Republier / rafraîchir le bouton du règlement'),
    )
    .addSubcommand((s) =>
      s
        .setName('attribuer-existants')
        .setDescription('Donner le rôle Client à tous les membres déjà présents'),
    )
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({ content: 'Serveur requis.', flags: MessageFlags.Ephemeral });
      return;
    }
    const config = await getGuildConfigByGuildId(interaction.guild.id);
    if (!config) {
      await interaction.reply({ content: 'Configuration absente.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!(await isDirection(interaction, config))) {
      await interaction.reply({ content: 'Réservé à la direction.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();

    if (sub === 'publier') {
      if (!config.channelReglement) {
        await interaction.editReply('Aucun salon règlement lié. `/config salons reglement:#…`.');
        return;
      }
      await publishVerification(interaction.client, config.id);
      await interaction.editReply('✅ Bouton du règlement publié / rafraîchi.');
      return;
    }

    // attribuer-existants
    if (!config.roleClient) {
      await interaction.editReply('Aucun rôle Client configuré. `/config roles client:@Client`.');
      return;
    }
    const role = await interaction.guild.roles.fetch(config.roleClient).catch(() => null);
    if (!role) {
      await interaction.editReply('Le rôle Client est introuvable (a-t-il été supprimé ?).');
      return;
    }
    // Le bot doit pouvoir gerer ce role (hierarchie).
    const me = interaction.guild.members.me;
    if (me && role.position >= me.roles.highest.position) {
      await interaction.editReply(
        'Le rôle Client est au-dessus du rôle du bot : remonte le rôle du bot au-dessus, puis réessaie.',
      );
      return;
    }

    const members = await interaction.guild.members.fetch();
    const targets = members.filter((m) => !m.user.bot && !m.roles.cache.has(role.id));
    let granted = 0;
    let failed = 0;
    for (const member of targets.values()) {
      try {
        await member.roles.add(role.id);
        granted++;
      } catch (err) {
        failed++;
        logger.warn({ err, memberId: member.id }, 'Attribution role Client (masse) KO');
      }
    }

    await writeAudit(prisma, {
      guildConfigId: config.id,
      action: 'CLIENT_ROLE_BACKFILL',
      authorDiscordId: interaction.user.id,
      after: { granted, failed },
    });

    await interaction.editReply(
      `✅ Rôle Client attribué à **${granted}** membre(s).` +
        (failed > 0 ? ` ⚠️ ${failed} échec(s) (permissions/hiérarchie).` : '') +
        '\n_Leur pseudo RP n’est pas modifié (ils n’ont pas rempli le formulaire) — ' +
        'ceux qui veulent peuvent quand même cliquer le bouton du règlement._',
    );
    logger.info({ granted, failed }, 'Backfill role Client');
  },
};
