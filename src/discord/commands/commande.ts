import { AttachmentType, ClientOrderStatus } from '@prisma/client';
import {
  type AutocompleteInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getOpenWeek } from '../../modules/accounting/accountingService.js';
import {
  buildBadgeCelebration,
  buildOrderDeliveredCelebration,
  buildPartnerObjectiveCelebration,
  postCelebration,
} from '../celebrations.js';
import { checkAndAwardContributionBadges } from '../../modules/badges/badgeService.js';
import { sendEmployeeDM } from '../notify.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import {
  getEmployeeByDiscordId,
  getGuildConfigByGuildId,
  resolveMemberGrade,
} from '../../modules/employees/employeeService.js';
import {
  findActivePartnerByName,
  listActivePartners,
  partnerObjectiveJustReached,
} from '../../modules/partners/partnerService.js';
import { mentionDirection, postToLogs } from '../notify.js';
import { downloadAndStore, isImageAttachment } from '../../modules/sales/attachments.js';
import { riskBadge } from '../../modules/sales/fraud.js';
import { evaluateOrderContributionFraud } from '../../modules/sales/fraudService.js';
import {
  cancelOrder,
  createOrder,
  deliverOrder,
  getOrderByReference,
  payOrder,
  recordContribution,
} from '../../modules/orders/orderService.js';
import { isDirection } from '../permissions.js';
import type { SlashCommand } from './types.js';

const nf = new Intl.NumberFormat('fr-FR');
const money = (n: number): string => `${nf.format(n)} $`;

/** Parse une echeance "JJ/MM/AAAA" en Date (null si absente/invalide). */
function parseDeadline(raw: string | null): Date | null {
  if (!raw) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const STATUS_LABEL: Record<ClientOrderStatus, string> = {
  OUVERTE: '🟡 Ouverte',
  LIVREE: '📦 Livrée (à encaisser)',
  PAYEE: '✅ Payée',
  ANNULEE: '🚫 Annulée',
};

/**
 * Gestion des commandes client (CDC : ventes B2C negociees par la direction).
 * Reservee a la direction. La production est realisee a plusieurs ; chaque
 * contribution est payee au tarif du grade et compte dans le classement.
 */
export const commandeCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('commande')
    .setDescription('Gestion des commandes client (direction)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('creer')
        .setDescription('Créer une commande client négociée')
        .addStringOption((o) =>
          o.setName('client').setDescription('Nom RP du client / org').setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('volume')
            .setDescription('Objectif de production')
            .setMinValue(1)
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('prix')
            .setDescription('Prix total négocié ($)')
            .setMinValue(1)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('description').setDescription('Détails de la commande').setRequired(false),
        )
        .addStringOption((o) =>
          o.setName('echeance').setDescription('Échéance JJ/MM/AAAA').setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName('partenaire')
            .setDescription('Rattacher à un partenaire (objectif)')
            .setAutocomplete(true)
            .setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('contribuer')
        .setDescription('Enregistrer la production d’un employé sur une commande')
        .addStringOption((o) =>
          o.setName('commande').setDescription('Référence CMD-AAAA-NNNN').setRequired(true),
        )
        .addUserOption((o) =>
          o.setName('employe').setDescription('Employé qui a produit').setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName('quantite').setDescription('Unités produites').setMinValue(1).setRequired(true),
        )
        .addAttachmentOption((o) =>
          o.setName('preuve_avant').setDescription('Coffre plein avant').setRequired(true),
        )
        .addAttachmentOption((o) =>
          o.setName('preuve_apres').setDescription('Coffre vide après').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('livrer')
        .setDescription('Marquer une commande comme livrée au client')
        .addStringOption((o) =>
          o.setName('commande').setDescription('Référence CMD-AAAA-NNNN').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('payer')
        .setDescription('Encaisser une commande (intègre le CA à la semaine)')
        .addStringOption((o) =>
          o.setName('commande').setDescription('Référence CMD-AAAA-NNNN').setRequired(true),
        )
        .addAttachmentOption((o) =>
          o.setName('preuve').setDescription('Preuve de paiement').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('annuler')
        .setDescription('Annuler une commande (hors payée)')
        .addStringOption((o) =>
          o.setName('commande').setDescription('Référence CMD-AAAA-NNNN').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('motif').setDescription('Motif d’annulation').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('voir')
        .setDescription('Afficher l’état d’une commande')
        .addStringOption((o) =>
          o.setName('commande').setDescription('Référence CMD-AAAA-NNNN').setRequired(true),
        ),
    )
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
      const clientName = interaction.options.getString('client', true).trim();
      const volume = interaction.options.getInteger('volume', true);
      const prix = interaction.options.getInteger('prix', true);
      const description = interaction.options.getString('description')?.trim() || null;
      const echeanceRaw = interaction.options.getString('echeance');
      const deadline = parseDeadline(echeanceRaw);
      const partnerName = interaction.options.getString('partenaire')?.trim();
      const partner = partnerName ? await findActivePartnerByName(config.id, partnerName) : null;
      if (partnerName && !partner) {
        await interaction.editReply(
          `Partenaire introuvable : « ${partnerName} ». Vois \`/partenaire voir\`.`,
        );
        return;
      }

      const res = await createOrder({
        guildConfigId: config.id,
        clientName,
        description,
        targetQuantity: volume,
        negotiatedPrice: prix,
        deadline,
        createdByDiscordId: interaction.user.id,
        partnerId: partner?.id ?? null,
      });
      if (!res.ok) {
        await interaction.editReply(`Échec : ${res.reason}`);
        return;
      }
      const partnerNote = partner ? `\n🤝 Rattachée au partenaire **${partner.name}**.` : '';
      const note =
        (echeanceRaw && !deadline ? '\n⚠️ Échéance ignorée (format attendu : JJ/MM/AAAA).' : '') +
        partnerNote;
      await interaction.editReply(
        `✅ Commande **${res.data.reference}** créée pour **${clientName}** — objectif ${nf.format(volume)} u, ${money(prix)}.${note}`,
      );
      scheduleDashboardUpdate(interaction.client, config.id);
      return;
    }

    if (sub === 'contribuer') {
      const reference = interaction.options.getString('commande', true).trim().toUpperCase();
      const user = interaction.options.getUser('employe', true);
      const quantity = interaction.options.getInteger('quantite', true);
      const before = interaction.options.getAttachment('preuve_avant', true);
      const after = interaction.options.getAttachment('preuve_apres', true);

      if (!isImageAttachment(before) || !isImageAttachment(after)) {
        await interaction.editReply('Les deux preuves doivent être des images.');
        return;
      }

      const order = await getOrderByReference(config.id, reference);
      if (!order) {
        await interaction.editReply(`Commande ${reference} introuvable.`);
        return;
      }
      if (order.status !== ClientOrderStatus.OUVERTE) {
        await interaction.editReply('Seule une commande ouverte accepte des contributions.');
        return;
      }

      const employee = await getEmployeeByDiscordId(user.id);
      if (!employee || employee.guildConfigId !== config.id || employee.status !== 'ACTIVE') {
        await interaction.editReply(`<@${user.id}> n’est pas un employé actif.`);
        return;
      }

      // Grade de l'employe (non bloquant : anomalie signalee).
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      let gradeLabel: string | null = null;
      let gradeRoleId: string | null = null;
      let salaryRate: number | null = null;
      let gradeWarning: string | null = null;
      if (!member) {
        gradeWarning = 'Membre introuvable.';
      } else {
        const grade = await resolveMemberGrade(member, config.id);
        if (grade.selected) {
          gradeLabel = grade.selected.label;
          gradeRoleId = grade.selected.roleId;
          salaryRate = grade.selected.ratePerUnit;
        }
        if (grade.missing) gradeWarning = 'Aucun grade salarial reconnu.';
        else if (grade.ambiguous) gradeWarning = 'Plusieurs grades reconnus.';
      }

      let stored;
      try {
        stored = await Promise.all(
          [AttachmentType.COFFRE_PLEIN, AttachmentType.COFFRE_VIDE].map((type, i) =>
            downloadAndStore({
              guildId: interaction.guild!.id,
              threadId: `order-${order.id}`,
              type,
              messageId: interaction.id,
              attachment: i === 0 ? before : after,
            }),
          ),
        );
      } catch {
        await interaction.editReply('Échec de la copie des preuves. Réessaie.');
        return;
      }

      const risk = await evaluateOrderContributionFraud({
        guildConfigId: config.id,
        quantity,
        hashes: stored.map((s) => s.sha256),
      });

      const res = await recordContribution({
        orderId: order.id,
        guildConfigId: config.id,
        employeeId: employee.id,
        quantity,
        gradeLabel,
        gradeRoleId,
        salaryRate,
        attachments: stored,
        riskLevel: risk.level,
        riskReasons: risk.reasons.length > 0 ? risk.reasons.join(' ') : null,
        recordedByDiscordId: interaction.user.id,
      });
      if (!res.ok) {
        await interaction.editReply(`Échec : ${res.reason}`);
        return;
      }

      if (risk.level !== 'CLEAN') {
        await postToLogs(interaction.guild, config, {
          content: `${mentionDirection(config)} ${riskBadge(risk.level)} Contribution sur ${order.reference} signalée : ${risk.reasons.join(' ')}`,
        });
      }

      const produced = order.producedQuantity + quantity;
      const warn = gradeWarning ? `\n⚠️ ${gradeWarning}` : '';
      await interaction.editReply(
        `✅ ${nf.format(quantity)} u de **${employee.nomRP}** enregistrées sur **${order.reference}** — production ${nf.format(produced)}/${nf.format(order.targetQuantity)}.${warn}`,
      );
      scheduleDashboardUpdate(interaction.client, config.id);
      // Badges de contribution : le cumul de contributions peut franchir un palier.
      const freshBadges = await checkAndAwardContributionBadges(config.id, employee.id);
      if (freshBadges.length > 0) {
        await postCelebration(
          interaction.client,
          config.id,
          buildBadgeCelebration(employee.nomRP, freshBadges),
        );
        await sendEmployeeDM(
          interaction.client,
          interaction.user.id,
          `🏅 Bravo ${employee.nomRP} ! Tu débloques : ${freshBadges.map((b) => `${b.emoji} ${b.label}`).join(', ')}.`,
        );
      }
      return;
    }

    if (sub === 'livrer') {
      const reference = interaction.options.getString('commande', true).trim().toUpperCase();
      const order = await getOrderByReference(config.id, reference);
      if (!order) {
        await interaction.editReply(`Commande ${reference} introuvable.`);
        return;
      }
      const res = await deliverOrder(order.id, interaction.user.id);
      if (res.ok) {
        scheduleDashboardUpdate(interaction.client, config.id);
        // Celebration : remercie publiquement les producteurs (boucle de feedback).
        await postCelebration(
          interaction.client,
          config.id,
          buildOrderDeliveredCelebration(order.reference, order.clientName, order.contributors),
        );
      }
      await interaction.editReply(
        res.ok
          ? `📦 Commande **${res.data.reference}** marquée livrée. En attente de paiement.`
          : `Échec : ${res.reason}`,
      );
      return;
    }

    if (sub === 'payer') {
      const reference = interaction.options.getString('commande', true).trim().toUpperCase();
      const proof = interaction.options.getAttachment('preuve', true);
      const order = await getOrderByReference(config.id, reference);
      if (!order) {
        await interaction.editReply(`Commande ${reference} introuvable.`);
        return;
      }
      const week = await getOpenWeek(config.id);
      if (!week) {
        await interaction.editReply(
          'Aucune semaine ouverte : impossible d’intégrer le CA. Ouvre une semaine d’abord.',
        );
        return;
      }

      let proofKey: string | null = null;
      try {
        const s = await downloadAndStore({
          guildId: interaction.guild.id,
          threadId: `order-${order.id}`,
          type: AttachmentType.COFFRE_PLEIN, // emplacement de stockage (preuve de paiement)
          messageId: interaction.id,
          attachment: proof,
        });
        proofKey = s.storageKey;
      } catch {
        proofKey = null; // la copie echoue : on encaisse quand meme, trace partielle
      }

      const res = await payOrder({
        orderId: order.id,
        actorId: interaction.user.id,
        weekId: week.id,
        paymentProofKey: proofKey,
      });
      if (!res.ok) {
        await interaction.editReply(`Échec : ${res.reason}`);
        return;
      }
      scheduleDashboardUpdate(interaction.client, config.id);
      // Celebration si cette commande payee fait atteindre l'objectif du partenaire.
      const reached = await partnerObjectiveJustReached(order.id, order.producedQuantity);
      if (reached) {
        await postCelebration(
          interaction.client,
          config.id,
          buildPartnerObjectiveCelebration(reached.name, reached.target),
        );
      }
      await interaction.editReply(
        `✅ Commande **${res.data.reference}** encaissée — ${money(res.data.total)} intégrés au CA de la semaine.`,
      );
      return;
    }

    if (sub === 'annuler') {
      const reference = interaction.options.getString('commande', true).trim().toUpperCase();
      const motif = interaction.options.getString('motif', true).trim();
      const order = await getOrderByReference(config.id, reference);
      if (!order) {
        await interaction.editReply(`Commande ${reference} introuvable.`);
        return;
      }
      const res = await cancelOrder(order.id, interaction.user.id, motif);
      if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
      await interaction.editReply(
        res.ok ? `🚫 Commande **${res.data.reference}** annulée.` : `Échec : ${res.reason}`,
      );
      return;
    }

    if (sub === 'voir') {
      const reference = interaction.options.getString('commande', true).trim().toUpperCase();
      const order = await getOrderByReference(config.id, reference);
      if (!order) {
        await interaction.editReply(`Commande ${reference} introuvable.`);
        return;
      }
      const contributors =
        order.contributors.length > 0
          ? order.contributors.map((c) => `• ${c.nomRP} — ${nf.format(c.quantity)} u`).join('\n')
          : '_Aucune contribution._';
      const deadline = order.deadline
        ? order.deadline.toLocaleDateString('fr-FR', { timeZone: config.timezone })
        : '—';
      const embed = new EmbedBuilder()
        .setTitle(`Commande ${order.reference} — ${order.clientName}`)
        .setColor(0x2e86de)
        .addFields(
          { name: 'Statut', value: STATUS_LABEL[order.status], inline: true },
          {
            name: 'Production',
            value: `${nf.format(order.producedQuantity)}/${nf.format(order.targetQuantity)} u`,
            inline: true,
          },
          { name: 'Prix négocié', value: money(order.negotiatedPrice), inline: true },
          { name: 'Échéance', value: deadline, inline: true },
          { name: 'Contributeurs', value: contributors },
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }
  },
};
