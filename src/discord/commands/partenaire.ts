import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import { prisma } from '../../infrastructure/database/client.js';
import { getOpenWeek } from '../../modules/accounting/accountingService.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import { getGuildConfigByGuildId } from '../../modules/employees/employeeService.js';
import {
  createPartner,
  deactivatePartner,
  deliveredByPartnerInWeek,
  listActivePartners,
  setPartnerObjective,
} from '../../modules/partners/partnerService.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

const nf = new Intl.NumberFormat('fr-FR');

/** Gestion des partenaires et de leurs objectifs (direction). */
export const partenaireCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('partenaire')
    .setDescription('Gérer les partenaires et leurs objectifs (direction)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('creer')
        .setDescription('Créer un partenaire')
        .addStringOption((o) =>
          o.setName('nom').setDescription('Nom du partenaire').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('objectif')
        .setDescription('Fixer l’objectif de quantité d’un partenaire')
        .addStringOption((o) =>
          o.setName('nom').setDescription('Partenaire').setAutocomplete(true).setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('quantite')
            .setDescription('Objectif (nombre de produits à fournir)')
            .setMinValue(1)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('retirer')
        .setDescription('Retirer un partenaire')
        .addStringOption((o) =>
          o.setName('nom').setDescription('Partenaire').setAutocomplete(true).setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName('voir').setDescription('Afficher les partenaires et objectifs'))
    .toJSON(),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (!interaction.inGuild()) return void interaction.respond([]);
    const config = await getGuildConfigByGuildId(interaction.guildId);
    if (!config) return void interaction.respond([]);
    const focused = interaction.options.getFocused().toString().toLowerCase();
    const partners = await listActivePartners(config.id);
    await interaction.respond(
      partners
        .filter((p) => p.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((p) => ({ name: p.name, value: p.name })),
    );
  },

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
      await interaction.reply({
        content: 'Réservé à la direction.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();

    if (sub === 'creer') {
      const nom = interaction.options.getString('nom', true);
      const res = await createPartner(config.id, nom);
      if (!res.ok) {
        await interaction.editReply(`Échec : ${res.reason}`);
        return;
      }
      await writeAudit(prisma, {
        guildConfigId: config.id,
        action: 'PARTNER_CREATED',
        authorDiscordId: interaction.user.id,
        entityType: 'Partner',
        entityId: res.data.id,
        after: { name: res.data.name },
      });
      scheduleDashboardUpdate(interaction.client, config.id);
      await interaction.editReply(`✅ Partenaire **${res.data.name}** créé.`);
      return;
    }

    if (sub === 'objectif') {
      const nom = interaction.options.getString('nom', true);
      const quantite = interaction.options.getInteger('quantite', true);
      const res = await setPartnerObjective(config.id, nom, quantite);
      if (!res.ok) {
        await interaction.editReply(`Échec : ${res.reason}`);
        return;
      }
      await writeAudit(prisma, {
        guildConfigId: config.id,
        action: 'PARTNER_OBJECTIVE_SET',
        authorDiscordId: interaction.user.id,
        entityType: 'Partner',
        entityId: res.data.id,
        after: { objectiveTarget: quantite },
      });
      scheduleDashboardUpdate(interaction.client, config.id);
      await interaction.editReply(
        `🎯 Objectif **hebdomadaire** de **${res.data.name}** fixé à ${nf.format(quantite)} produits/semaine.`,
      );
      return;
    }

    if (sub === 'retirer') {
      const nom = interaction.options.getString('nom', true);
      const res = await deactivatePartner(config.id, nom);
      if (!res.ok) {
        await interaction.editReply(`Échec : ${res.reason}`);
        return;
      }
      scheduleDashboardUpdate(interaction.client, config.id);
      await interaction.editReply(`🚫 Partenaire **${res.data.name}** retiré.`);
      return;
    }

    // voir
    const partners = await listActivePartners(config.id);
    if (partners.length === 0) {
      await interaction.editReply('Aucun partenaire. Crée-en un avec `/partenaire creer`.');
      return;
    }
    const week = await getOpenWeek(config.id);
    const deliveredMap = week
      ? await deliveredByPartnerInWeek(
          week.id,
          partners.map((p) => p.id),
        )
      : new Map<string, number>();
    const lines: string[] = [];
    for (const p of partners) {
      const delivered = deliveredMap.get(p.id) ?? 0;
      const target = p.objectiveTarget;
      lines.push(
        target === null
          ? `• **${p.name}** — ${nf.format(delivered)} u cette semaine (pas d’objectif)`
          : `• **${p.name}** — ${nf.format(delivered)}/${nf.format(target)} u/sem${delivered >= target ? ' ✅' : ''}`,
      );
    }
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🤝 Partenaires (objectifs hebdomadaires)')
          .setColor(0x9b59b6)
          .setDescription(lines.join('\n')),
      ],
    });
  },
};
