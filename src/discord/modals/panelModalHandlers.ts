import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { writeAudit } from '../../modules/audit/auditService.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import {
  getGuildConfigByGuildId,
  upsertGradeRate,
} from '../../modules/employees/employeeService.js';
import { createOrder } from '../../modules/orders/orderService.js';
import {
  createPartner,
  findActivePartnerByName,
  setPartnerObjective,
} from '../../modules/partners/partnerService.js';
import { PanelFieldId, PanelModalId } from '../components/ids.js';
import { buildConfirmMessage } from '../panel/confirmUi.js';
import { putPending } from '../panel/pending.js';
import { isDirectionMember } from '../permissions.js';

/** Parse une echeance "JJ/MM/AAAA" en Date (null si absente/invalide). */
function parseDeadline(raw: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Les modals salaire/partenaire portent l'id de l'entite en suffixe.
const PREFIXES = Object.values(PanelModalId);
function matchedPrefix(customId: string): string | null {
  return PREFIXES.find((p) => customId === p || customId.startsWith(`${p}:`)) ?? null;
}

/** @returns true si l'interaction a ete prise en charge ici. */
export async function handlePanelModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const base = matchedPrefix(interaction.customId);
  if (!base) return false;

  const ephemeral = MessageFlags.Ephemeral;
  if (!interaction.guild) {
    await interaction.reply({ content: 'Serveur requis.', flags: ephemeral });
    return true;
  }
  const config = await getGuildConfigByGuildId(interaction.guild.id);
  if (!config || !(await isDirectionMember(interaction.guild, interaction.user.id, config))) {
    await interaction.reply({ content: 'Réservé à la direction.', flags: ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: ephemeral });
  const suffix = interaction.customId.slice(base.length + 1); // id encode (salaire/partenaire)

  if (base === PanelModalId.SALAIRE) {
    const montant = Number(interaction.fields.getTextInputValue(PanelFieldId.MONTANT).trim());
    if (!Number.isInteger(montant) || montant < 1) {
      await interaction.editReply('Tarif invalide (entier positif attendu, ex. 165).');
      return true;
    }
    const grade = await prisma.gradeRate.findFirst({
      where: { guildConfigId: config.id, validTo: null, roleId: suffix },
      select: { roleId: true, label: true },
    });
    if (!grade) {
      await interaction.editReply('Grade introuvable (a-t-il été retiré ?). Rouvre le panel.');
      return true;
    }
    await upsertGradeRate(config.id, grade.roleId, grade.label, montant);
    scheduleDashboardUpdate(interaction.client, config.id);
    await interaction.editReply(`✅ Tarif de **${grade.label}** mis à jour : ${montant} $/u.`);
    return true;
  }

  if (base === PanelModalId.PARTENAIRE) {
    const objectif = Number(interaction.fields.getTextInputValue(PanelFieldId.OBJECTIF).trim());
    if (!Number.isInteger(objectif) || objectif < 1) {
      await interaction.editReply('Objectif invalide (entier positif attendu).');
      return true;
    }
    const partner = await prisma.partner.findFirst({
      where: { id: suffix, guildConfigId: config.id },
      select: { name: true },
    });
    if (!partner) {
      await interaction.editReply('Partenaire introuvable. Rouvre le panel.');
      return true;
    }
    const res = await setPartnerObjective(config.id, partner.name, objectif);
    if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
    await interaction.editReply(
      res.ok
        ? `🎯 Objectif hebdomadaire de **${res.data.name}** : ${objectif} u/semaine.`
        : `Échec : ${res.reason}`,
    );
    return true;
  }

  if (base === PanelModalId.MENU) {
    const nom = interaction.fields.getTextInputValue(PanelFieldId.NOM).trim();
    const prix = Number(interaction.fields.getTextInputValue(PanelFieldId.PRIX).trim());
    if (!nom) {
      await interaction.editReply('Le nom du produit est obligatoire.');
      return true;
    }
    if (!Number.isInteger(prix) || prix < 1) {
      await interaction.editReply('Prix invalide (entier positif attendu).');
      return true;
    }
    const existing = await prisma.product.findFirst({
      where: { guildConfigId: config.id, name: { equals: nom, mode: 'insensitive' }, active: true },
      select: { retailPrice: true },
    });
    const oldPrice = existing?.retailPrice ?? null;
    const token = putPending(interaction.user.id, {
      kind: 'menu_price',
      guildConfigId: config.id,
      name: nom,
      price: prix,
      oldPrice,
    });
    const desc =
      oldPrice === null
        ? `Ajouter **${nom}** au menu à **${prix} $** ?`
        : `Changer le prix de **${nom}** : **${oldPrice} $ → ${prix} $** ?`;
    await interaction.editReply(buildConfirmMessage({ title: '🍴 Menu', description: desc, token }));
    return true;
  }

  if (base === PanelModalId.PNJ_PRICE) {
    const prix = Number(interaction.fields.getTextInputValue(PanelFieldId.PRIX).trim());
    if (!Number.isInteger(prix) || prix < 1) {
      await interaction.editReply('Prix invalide (entier positif attendu).');
      return true;
    }
    const oldPrice = config.pnjUnitPrice;
    const token = putPending(interaction.user.id, {
      kind: 'pnj_price',
      guildConfigId: config.id,
      price: prix,
      oldPrice,
    });
    await interaction.editReply(
      buildConfirmMessage({
        title: '💵 Prix de vente PNJ',
        description: `Changer le prix PNJ : **${oldPrice} $ → ${prix} $/u** ?\n_Impacte le CA des futures ventes au PNJ._`,
        token,
      }),
    );
    return true;
  }

  if (base === PanelModalId.PARTNER_CREATE) {
    const nom = interaction.fields.getTextInputValue(PanelFieldId.NOM).trim();
    const res = await createPartner(config.id, nom);
    if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
    await interaction.editReply(
      res.ok ? `🤝 Partenaire **${res.data.name}** créé.` : `Échec : ${res.reason}`,
    );
    return true;
  }

  if (base === PanelModalId.REPARTITION) {
    const reserve = Number(interaction.fields.getTextInputValue(PanelFieldId.RESERVE).trim());
    const prime = Number(interaction.fields.getTextInputValue(PanelFieldId.PRIME).trim());
    const directeur = Number(interaction.fields.getTextInputValue(PanelFieldId.DIRECTEUR).trim());
    const ints = [reserve, prime, directeur];
    if (ints.some((n) => !Number.isInteger(n) || n < 0 || n > 100)) {
      await interaction.editReply('Pourcentages invalides (entiers de 0 à 100 attendus).');
      return true;
    }
    if (prime + directeur > 100) {
      await interaction.editReply(
        `Prime (${prime} %) + Directeur (${directeur} %) dépasse 100 % : il ne reste rien pour le Co-directeur.`,
      );
      return true;
    }
    const coDir = 100 - prime - directeur;
    const before = {
      reserveRatePercent: config.reserveRatePercent,
      bonusRatePercent: config.bonusRatePercent,
      directorRatePercent: config.directorRatePercent,
    };
    await prisma.guildConfig.update({
      where: { id: config.id },
      data: { reserveRatePercent: reserve, bonusRatePercent: prime, directorRatePercent: directeur },
    });
    await writeAudit(prisma, {
      guildConfigId: config.id,
      action: 'CONFIG_DISTRIBUTION_SET',
      authorDiscordId: interaction.user.id,
      before,
      after: { reserveRatePercent: reserve, bonusRatePercent: prime, directorRatePercent: directeur },
    });
    scheduleDashboardUpdate(interaction.client, config.id);
    await interaction.editReply(
      `💰 Répartition mise à jour : réserve **${reserve} %**, prime **${prime} %**, Directeur **${directeur} %**, Co-directeur **${coDir} %** (le reste).\n_S’applique à la prochaine clôture, sans réécrire l’historique._`,
    );
    return true;
  }

  if (base === PanelModalId.PEREMPTION) {
    const jours = Number(interaction.fields.getTextInputValue(PanelFieldId.JOURS).trim());
    const heures = Number(interaction.fields.getTextInputValue(PanelFieldId.HEURES).trim());
    if (!Number.isInteger(jours) || jours < 0 || !Number.isInteger(heures) || heures < 0 || heures > 23) {
      await interaction.editReply('Durée invalide (jours ≥ 0, heures entre 0 et 23).');
      return true;
    }
    const minutes = (jours * 24 + heures) * 60;
    if (minutes <= 0) {
      await interaction.editReply('La durée de vie doit être supérieure à 0.');
      return true;
    }
    const before = { hotdogLifetimeMinutes: config.hotdogLifetimeMinutes };
    await prisma.guildConfig.update({
      where: { id: config.id },
      data: { hotdogLifetimeMinutes: minutes },
    });
    await writeAudit(prisma, {
      guildConfigId: config.id,
      action: 'CONFIG_PEREMPTION_SET',
      authorDiscordId: interaction.user.id,
      before,
      after: { hotdogLifetimeMinutes: minutes },
    });
    await interaction.editReply(
      `🌭 Péremption d’un lot : **${jours} j ${heures} h**.\n_S’applique aux lots produits à partir de maintenant._`,
    );
    return true;
  }

  if (base === PanelModalId.FRAUDE) {
    const volume = Number(interaction.fields.getTextInputValue(PanelFieldId.SEUIL_VOLUME).trim());
    const rafale = Number(interaction.fields.getTextInputValue(PanelFieldId.RAFALE_NB).trim());
    const fenetre = Number(interaction.fields.getTextInputValue(PanelFieldId.FENETRE_MIN).trim());
    if ([volume, rafale, fenetre].some((n) => !Number.isInteger(n) || n < 1)) {
      await interaction.editReply('Seuils invalides (entiers positifs attendus).');
      return true;
    }
    const before = {
      fraudQuantityThreshold: config.fraudQuantityThreshold,
      fraudBurstCount: config.fraudBurstCount,
      fraudBurstWindowMinutes: config.fraudBurstWindowMinutes,
    };
    await prisma.guildConfig.update({
      where: { id: config.id },
      data: {
        fraudQuantityThreshold: volume,
        fraudBurstCount: rafale,
        fraudBurstWindowMinutes: fenetre,
      },
    });
    await writeAudit(prisma, {
      guildConfigId: config.id,
      action: 'CONFIG_FRAUD_SET',
      authorDiscordId: interaction.user.id,
      before,
      after: { fraudQuantityThreshold: volume, fraudBurstCount: rafale, fraudBurstWindowMinutes: fenetre },
    });
    await interaction.editReply(
      `🛡️ Seuils anti-fraude : volume > **${volume} u**, rafale ≥ **${rafale}** ventes en **${fenetre} min**.`,
    );
    return true;
  }

  if (base === PanelModalId.RAPPEL) {
    const jour = Number(interaction.fields.getTextInputValue(PanelFieldId.JOUR).trim());
    const debut = Number(interaction.fields.getTextInputValue(PanelFieldId.HEURE_DEBUT).trim());
    const fin = Number(interaction.fields.getTextInputValue(PanelFieldId.HEURE_FIN).trim());
    const fuseau = interaction.fields.getTextInputValue(PanelFieldId.FUSEAU).trim();
    if (!Number.isInteger(jour) || jour < 0 || jour > 6) {
      await interaction.editReply('Jour invalide (0 = lundi … 6 = dimanche).');
      return true;
    }
    if (!Number.isInteger(debut) || debut < 0 || debut > 23 || !Number.isInteger(fin) || fin < 1 || fin > 24 || fin <= debut) {
      await interaction.editReply('Plage horaire invalide (début 0-23, fin 1-24, fin > début).');
      return true;
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: fuseau });
    } catch {
      await interaction.editReply(`Fuseau horaire inconnu : « ${fuseau} » (ex. Europe/Paris).`);
      return true;
    }
    const before = {
      closureReminderWeekday: config.closureReminderWeekday,
      closureReminderHourStart: config.closureReminderHourStart,
      closureReminderHourEnd: config.closureReminderHourEnd,
      timezone: config.timezone,
    };
    await prisma.guildConfig.update({
      where: { id: config.id },
      data: {
        closureReminderWeekday: jour,
        closureReminderHourStart: debut,
        closureReminderHourEnd: fin,
        timezone: fuseau,
      },
    });
    await writeAudit(prisma, {
      guildConfigId: config.id,
      action: 'CONFIG_REMINDER_SET',
      authorDiscordId: interaction.user.id,
      before,
      after: { closureReminderWeekday: jour, closureReminderHourStart: debut, closureReminderHourEnd: fin, timezone: fuseau },
    });
    const jours = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    await interaction.editReply(
      `⏰ Rappel de clôture : **${jours[jour]}** entre **${debut} h** et **${fin} h**. Fuseau : **${fuseau}**.`,
    );
    return true;
  }

  // ORDER_CREATE
  const clientName = interaction.fields.getTextInputValue(PanelFieldId.CLIENT).trim();
  const volume = Number(interaction.fields.getTextInputValue(PanelFieldId.VOLUME).trim());
  const prix = Number(interaction.fields.getTextInputValue(PanelFieldId.PRIX).trim());
  const partnerName = interaction.fields.getTextInputValue(PanelFieldId.PARTENAIRE).trim();
  const echeance = interaction.fields.getTextInputValue(PanelFieldId.ECHEANCE).trim();
  if (!clientName) {
    await interaction.editReply('Le client est obligatoire.');
    return true;
  }
  if (!Number.isInteger(volume) || volume < 1 || !Number.isInteger(prix) || prix < 1) {
    await interaction.editReply('Volume et prix doivent être des entiers positifs.');
    return true;
  }
  const partner = partnerName ? await findActivePartnerByName(config.id, partnerName) : null;
  if (partnerName && !partner) {
    await interaction.editReply(`Partenaire introuvable : « ${partnerName} ».`);
    return true;
  }
  const res = await createOrder({
    guildConfigId: config.id,
    clientName,
    description: null,
    targetQuantity: volume,
    negotiatedPrice: prix,
    deadline: echeance ? parseDeadline(echeance) : null,
    createdByDiscordId: interaction.user.id,
    partnerId: partner?.id ?? null,
  });
  if (res.ok) scheduleDashboardUpdate(interaction.client, config.id);
  await interaction.editReply(
    res.ok
      ? `📦 Commande **${res.data.reference}** créée pour ${clientName}${partner ? ` (🤝 ${partner.name})` : ''}.`
      : `Échec : ${res.reason}`,
  );
  return true;
}
