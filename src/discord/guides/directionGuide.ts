import { type Client, EmbedBuilder, type TextBasedChannel } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';

/**
 * Guide direction (tuto) : un message permanent et soigne, maintenu par le bot,
 * recapitulant toutes les commandes de gestion. Toujours a jour.
 */
export function buildDirectionGuideEmbeds(): EmbedBuilder[] {
  const intro = new EmbedBuilder()
    .setTitle('📖 Guide Direction — Bot HotzDoggz')
    .setColor(0xff7a00)
    .setDescription(
      'Toutes tes commandes de gestion, au même endroit. Tape `/` puis le nom : ' +
        'Discord affiche les options. Tes réponses sont **privées**.\n\n' +
        '💡 Si tu ne retiens qu’une chose : **`/panel`**, ton poste de commande tout-en-un.',
    );

  const panel = new EmbedBuilder()
    .setTitle('🎛️ `/panel` — poste de commande')
    .setColor(0x34495e)
    .setDescription(
      '**Tout voir et tout gérer** depuis un seul message :\n' +
        '• 👀 Vue d’ensemble : semaine, commandes, partenaires, menu, salaires.\n' +
        '• ⚙️ Menu « Gérer » : salaire d’un grade · prix du menu · prix PNJ · ' +
        'créer / objectif d’un partenaire · créer une commande.\n' +
        '• 🔘 Boutons : ouvrir / clôturer la semaine · rafraîchir les tableaux.',
    );

  const commandes = new EmbedBuilder()
    .setTitle('📦 Commandes client')
    .setColor(0x2e86de)
    .setDescription(
      '• **`/commande creer`** — nouvelle commande (client, volume, prix, échéance, partenaire).\n' +
        '• **`/commande contribuer`** — production d’un employé (+ 2 preuves).\n' +
        '• **`/commande livrer`** — marquer livrée.\n' +
        '• **`/commande payer`** — encaisser → le CA rejoint la semaine.\n' +
        '• **`/commande voir`** · **`/commande annuler`**.',
    );

  const ventes = new EmbedBuilder()
    .setTitle('🌭 Ventes & menu')
    .setColor(0xe67e22)
    .setDescription(
      '• **`/menu ajouter`** / **`retirer`** / **`voir`** — produits & prix de détail.\n' +
        '• **`/menu image`** — photo (+ accroche) d’un produit : alimente le **menu public** ' +
        '`menu & tarifs`, tenu à jour par le bot (`/config salons menu:#…`).\n' +
        '• **`/facture`** (employés) — vente main en main (produits + photo de facture).\n' +
        '• ✅ Vérification : sur la **fiche** dans `controle-des-ventes`, boutons ' +
        '**Prendre en charge → Valider** (quantité par produit) **/ Refuser**.',
    );

  const compta = new EmbedBuilder()
    .setTitle('🧮 Comptabilité & paies')
    .setColor(0x27ae60)
    .setDescription(
      '• **`/semaine ouvrir`** · **`voir`** · **`cloturer`** · **`cloturer-force`** · **`reset`**.\n' +
        '• À la clôture : **semaine suivante ouverte automatiquement** + **récap festif** envoyé aux employés.\n' +
        '• **`/paie voir`** — bilan clair : **reste à verser**, non-payés en tête. ' +
        '**`/paie marquer-payee`** après le versement en jeu.\n' +
        '• **`/avance verser`** — acompte en cours de semaine (plafonné au gagné), ' +
        'déduit de la paie à la clôture · **`/avance voir`** / **`annuler`**.\n' +
        '• **`/export semaine`** — fichiers CSV (ventes + paies).',
    );

  const partenaires = new EmbedBuilder()
    .setTitle('🤝 Partenariats')
    .setColor(0x9b59b6)
    .setDescription(
      '• **`/partenaire creer`** · **`objectif`** (hebdomadaire) · **`retirer`** · **`voir`**.\n' +
        '• Rattache une commande : **`/commande creer … partenaire:Nom`** → l’objectif de la ' +
        'semaine monte, visible en direct côté employés.',
    );

  const corrections = new EmbedBuilder()
    .setTitle('🛠️ Corrections & équipe')
    .setColor(0xc0392b)
    .setDescription(
      '• **`/gestion voir`** — détail chiffré de la semaine (repérer une erreur).\n' +
        '• Corriger une erreur : **`/gestion rouvrir-semaine`** → **`annuler-commande`** / ' +
        '**`annuler-vente`** → **`/semaine cloturer`**. _(tout est audité)_\n' +
        '• **`/employe associer`** / **`archiver`** · **`/employe bracelet`** (multiplicateur ' +
        'x2/x3 : neutralisé pour une prime équitable).',
    );

  const accueil = new EmbedBuilder()
    .setTitle('👋 Accueil & vitrine visiteurs')
    .setColor(0x1abc9c)
    .setDescription(
      '• **Arrivée** : chaque nouveau est accueilli dans `bienvenue` et renvoyé vers `règlement`.\n' +
        '• **Sas d’accès** : bouton « J’accepte le règlement » → formulaire **nom RP** → ' +
        'rôle **Client** + pseudo.\n' +
        '• **`/acces attribuer-existants`** — rôle Client aux membres déjà présents · ' +
        '**`/acces publier`** — republie le bouton.\n' +
        '• **`/vitrine reglement`** / **`evenement`** — éditer les textes publics · ' +
        '**`/config accueil`** — message d’arrivée.\n' +
        '• **`/menu image`** — photo d’un produit → **menu public** maintenu par le bot.',
    );

  const reglages = new EmbedBuilder()
    .setTitle('⚙️ Réglages & automatismes')
    .setColor(0x7f8c8d)
    .setDescription(
      '• **`/config roles`** (grades + rôle **Client**) / **`salons`** (tous les salons) · ' +
        '**`/hotzdoggz diagnostic`** · **`/tableau publier`**.\n\n' +
        '🔔 **Le bot fait seul** : accueil + sas d’accès, contrôle anti-fraude (preuves ' +
        'recyclées), relances (validations en attente, commandes livrées non payées, rappel ' +
        'de clôture du dimanche), fiches de paie en DM, tableaux en direct, avis clients.',
    )
    .setFooter({ text: 'Guide maintenu automatiquement par le bot' });

  return [intro, panel, commandes, ventes, compta, partenaires, corrections, accueil, reglages];
}

/** Publie / met a jour le guide direction dans son salon dedie. */
export async function publishDirectionGuide(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelGuideDirection) return;

  const channel = await client.channels.fetch(config.channelGuideDirection).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    logger.warn({ channelId: config.channelGuideDirection }, 'Salon guide direction introuvable');
    return;
  }
  const embeds = buildDirectionGuideEmbeds();

  if (config.msgGuideDirection) {
    try {
      const msg = await (channel as TextBasedChannel).messages.fetch(config.msgGuideDirection);
      await msg.edit({ embeds });
      return;
    } catch {
      /* message supprime -> on recree */
    }
  }
  const created = await channel.send({ embeds });
  await prisma.guildConfig.update({
    where: { id: guildConfigId },
    data: { msgGuideDirection: created.id },
  });
}
