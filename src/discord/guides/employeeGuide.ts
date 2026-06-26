import { type Client, EmbedBuilder, type TextBasedChannel } from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';

/**
 * Guide employe (tuto) : un message permanent et soigne, maintenu par le bot,
 * expliquant tout le process cote employe. Toujours a jour.
 */
export function buildEmployeeGuideEmbeds(): EmbedBuilder[] {
  const intro = new EmbedBuilder()
    .setTitle('📘 Guide Employé — HotzDoggz')
    .setColor(0xff7a00)
    .setDescription(
      'Bienvenue dans l’équipe ! 🌭 Voici tout ce que tu dois savoir pour bosser avec le bot.\n' +
        'Tape `/` puis le nom de la commande : Discord t’affiche les champs. ' +
        'Tes réponses sont **privées** (toi seul les vois).\n\n' +
        '💡 Le réflexe utile : **`/macompta`** pour suivre ta prod, ton salaire et ta place.',
    );

  const circuit = new EmbedBuilder()
    .setTitle('🔄 Le circuit en 2 temps')
    .setColor(0x2e86de)
    .setDescription(
      'Nos hot dogs cuits **périment en 6j 17h** → on ne produit pas trop à l’avance.\n\n' +
        '**1️⃣ Ramasser des saucisses** (matière première, **ne périme pas**) → on stocke dans un véhicule.\n' +
        '**2️⃣ Transformer** les saucisses en hot dogs (1 pour 1), **juste avant** de vendre / un événement.\n' +
        '**3️⃣ Vendre** les hot dogs (au PNJ ou en main en main).',
    );

  const stock = new EmbedBuilder()
    .setTitle('🥩 Ramasser & transformer')
    .setColor(0xe67e22)
    .setDescription(
      '• **`/stock ramasser`** `vehicule` `quantite` — déclare les saucisses que tu as ramassées ' +
        '(ajoutées au véhicule). Ça valorise ton travail.\n' +
        '• **`/stock transformer`** `vehicule` `quantite` — transforme les saucisses en hot dogs ' +
        '(le bot t’indique dans combien de temps ils périment).\n' +
        '• **`/stock voir`** — l’état du stock (saucisses par véhicule + hot dogs prêts).\n' +
        '_Salon `stock` : tout est affiché en direct._',
    );

  const vendre = new EmbedBuilder()
    .setTitle('💵 Vendre (toujours avec preuves)')
    .setColor(0x27ae60)
    .setDescription(
      '• **`/vendre`** — vente au **PNJ** : quantité + **photo du coffre PLEIN** (avant) et **VIDE** ' +
        '(après). Le bot crée le post dans ton casier et la fiche pour la direction.\n' +
        '• **`/facture`** — vente **main en main** : tu choisis les produits du menu + la **photo de ' +
        'la facture**.\n' +
        '⚠️ **Preuves nettes obligatoires.** La direction vérifie chaque vente ; déclare honnêtement ' +
        '(un contrôle anti-fraude tourne).',
    );

  const planning = new EmbedBuilder()
    .setTitle('🗓️ Planning & commandes')
    .setColor(0x9b59b6)
    .setDescription(
      'Dans le salon **`planning`**, tu vois les **commandes** à produire et les **événements** de la ' +
        'semaine.\n' +
        '• Clique le menu **« Je me positionne »** pour signaler que tu aides (re-clique pour te retirer).\n' +
        '• Pour ta production sur une commande : **`/commande contribuer`** (avec 2 preuves), faite par ' +
        'la direction avec toi.',
    );

  const paie = new EmbedBuilder()
    .setTitle('💰 Ta paie & la prime')
    .setColor(0xf1c40f)
    .setDescription(
      '• **`/macompta`** — ta production, ton **salaire provisoire** et ta place dans la course à la prime.\n' +
        '• La **prime** de la semaine est **partagée** entre les vendeurs (du 1er au dernier), selon ' +
        'l’**effort** : le bracelet (×2/×3) est **neutralisé**, donc c’est juste pour tout le monde.\n' +
        '• Besoin d’une **avance** ? Demande à la direction (plafonnée à ce que tu as déjà gagné).\n' +
        '_Salons `tableau`, `développement` et `prime` : tout est en direct._',
    );

  const garage = new EmbedBuilder()
    .setTitle('🚚 Ton garage')
    .setColor(0x34495e)
    .setDescription(
      'La direction t’attribue des véhicules (**3 max** par employé). Tu les retrouves dans le salon ' +
        '**`garage`** (photo, plaque, capacité). C’est dans ces véhicules que tu stockes tes saucisses.',
    );

  const reflexes = new EmbedBuilder()
    .setTitle('✅ Les bons réflexes')
    .setColor(0x1abc9c)
    .setDescription(
      '• **Ramasse** des saucisses dès que tu peux (réserve qui ne périme pas).\n' +
        '• **Transforme** seulement ce que tu vas vendre bientôt (6j17h).\n' +
        '• **Photos nettes** à chaque vente (coffre plein/vide, facture).\n' +
        '• **Positionne-toi** sur le planning pour t’organiser avec l’équipe.\n' +
        '• Une question ? Demande à la direction. Bon appétit ! 🌭',
    )
    .setFooter({ text: 'Guide maintenu automatiquement par le bot' });

  return [intro, circuit, stock, vendre, planning, paie, garage, reflexes];
}

/** Publie / met a jour le guide employe dans son salon dedie. */
export async function publishEmployeeGuide(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelGuideEmployee) return;

  const channel = await client.channels.fetch(config.channelGuideEmployee).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    logger.warn({ channelId: config.channelGuideEmployee }, 'Salon guide employe introuvable');
    return;
  }
  const embeds = buildEmployeeGuideEmbeds();

  if (config.msgGuideEmployee) {
    try {
      const msg = await (channel as TextBasedChannel).messages.fetch(config.msgGuideEmployee);
      await msg.edit({ embeds });
      return;
    } catch {
      /* message supprime -> on recree */
    }
  }
  const created = await channel.send({ embeds });
  await prisma.guildConfig.update({
    where: { id: guildConfigId },
    data: { msgGuideEmployee: created.id },
  });
}
