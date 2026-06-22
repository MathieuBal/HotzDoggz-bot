import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  cancelLastAdvance,
  getAdvanceCapacity,
  listOpenWeekAdvances,
  recordAdvance,
} from '../../modules/payroll/advanceService.js';
import {
  getEmployeeByDiscordId,
  getGuildConfigByGuildId,
} from '../../modules/employees/employeeService.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

const nf = new Intl.NumberFormat('fr-FR');
const money = (n: number): string => `${nf.format(n)} $`;

/** Avances sur salaire en cours de semaine (direction). Plafonnees au gagne. */
export const avanceCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('avance')
    .setDescription('Avances sur salaire (direction)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('verser')
        .setDescription('Verser une avance à un employé (plafonnée à ce qu’il a gagné)')
        .addUserOption((o) => o.setName('membre').setDescription('Employé').setRequired(true))
        .addIntegerOption((o) =>
          o.setName('montant').setDescription('Montant de l’avance ($)').setMinValue(1).setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('note').setDescription('Note (optionnel)').setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('voir')
        .setDescription('Voir les avances de la semaine (ou la capacité d’un employé)')
        .addUserOption((o) =>
          o.setName('membre').setDescription('Employé (optionnel)').setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('annuler')
        .setDescription('Annuler la dernière avance d’un employé (semaine en cours)')
        .addUserOption((o) => o.setName('membre').setDescription('Employé').setRequired(true)),
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

    // 'voir' sans membre : tableau des avances de la semaine.
    if (sub === 'voir' && !interaction.options.getUser('membre')) {
      const advances = await listOpenWeekAdvances(config.id);
      const body =
        advances.length === 0
          ? '_Aucune avance versée cette semaine._'
          : advances.map((a) => `• **${a.nomRP}** — ${money(a.advanced)}`).join('\n');
      const totalAdv = advances.reduce((s, a) => s + a.advanced, 0);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Avances de la semaine')
            .setColor(0x9b59b6)
            .setDescription(body)
            .setFooter({ text: `Total avancé : ${nf.format(totalAdv)} $ (déduit à la clôture)` }),
        ],
      });
      return;
    }

    // Les autres sous-commandes ciblent un employe.
    const member = interaction.options.getUser('membre', true);
    const employee = await getEmployeeByDiscordId(member.id);
    if (!employee || employee.guildConfigId !== config.id || employee.status !== 'ACTIVE') {
      await interaction.editReply('Aucun employé actif associé à ce membre.');
      return;
    }

    if (sub === 'voir') {
      const cap = await getAdvanceCapacity(config.id, employee.id);
      if (!cap) {
        await interaction.editReply('Aucune semaine ouverte.');
        return;
      }
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Avance — ${employee.nomRP}`)
            .setColor(0x9b59b6)
            .setDescription(
              `Gagné cette semaine : **${money(cap.earned)}**\n` +
                `Déjà avancé : ${money(cap.alreadyAdvanced)}\n` +
                `➡️ Avance encore possible : **${money(cap.remaining)}**`,
            ),
        ],
      });
      return;
    }

    if (sub === 'annuler') {
      const res = await cancelLastAdvance(config.id, employee.id, employee.nomRP, interaction.user.id);
      await interaction.editReply(
        res.ok
          ? `↩️ Dernière avance de **${employee.nomRP}** annulée : ${money(res.data.amount)}.`
          : `Échec : ${res.reason}`,
      );
      return;
    }

    // verser
    const montant = interaction.options.getInteger('montant', true);
    const note = interaction.options.getString('note')?.trim() || null;
    const res = await recordAdvance({
      guildConfigId: config.id,
      employeeId: employee.id,
      nomRP: employee.nomRP,
      amount: montant,
      byDiscordId: interaction.user.id,
      note,
    });
    if (!res.ok) {
      await interaction.editReply(`Échec : ${res.reason}`);
      return;
    }
    await interaction.editReply(
      `✅ Avance de **${money(res.data.amount)}** versée à **${employee.nomRP}**.\n` +
        `Reste avançable : ${money(res.data.remainingAfter)}. _Sera déduite de sa paie à la clôture._`,
    );
  },
};
