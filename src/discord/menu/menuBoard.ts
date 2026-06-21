import {
  AttachmentBuilder,
  EmbedBuilder,
  type BaseMessageOptions,
  type Client,
  type TextBasedChannel,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { getObjectStorage } from '../../infrastructure/object-storage/factory.js';

const nf = new Intl.NumberFormat('fr-FR');
const money = (n: number): string => `${nf.format(n)} $`;

const INTRO =
  'Bienvenue chez **HotzDogz**, votre spécialiste du hot dog sur Los Santos. ' +
  'Sur place, en livraison ou sur commande (entreprises, rassos, événements privés) — ' +
  'des tarifs préférentiels selon les quantités.\n\n' +
  '🍴 Nos produits nourrissent et hydratent. En moyenne, **5 hot dogs** suffisent à ' +
  'remplir entièrement vos besoins.\n👥 Recrutement ouvert via ticket.';

function extOf(name: string | null): string {
  const e = name?.split('.').pop()?.toLowerCase();
  return e && /^[a-z0-9]{1,5}$/.test(e) ? e : 'png';
}

/**
 * Construit le message du menu public : un encadre d'intro + un bloc par produit
 * (image + nom + prix + accroche). Les images sont re-attachees au message
 * (reference attachment://) pour ne jamais expirer.
 */
export async function buildMenuBoard(guildConfigId: string): Promise<BaseMessageOptions> {
  const products = await prisma.product.findMany({
    where: { guildConfigId, active: true },
    orderBy: [{ retailPrice: 'asc' }, { name: 'asc' }],
    take: 9, // 1 embed d'intro + 9 produits = max 10 embeds/message
  });

  const intro = new EmbedBuilder()
    .setColor(0xff7a00)
    .setTitle('🌭 HOTZDOGZ — MENU & TARIFS')
    .setDescription(INTRO);

  const embeds: EmbedBuilder[] = [intro];
  const files: AttachmentBuilder[] = [];
  const storage = getObjectStorage();

  for (const p of products) {
    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`🌭 ${p.name}`)
      .setDescription((p.description ? `${p.description}\n\n` : '') + `**Prix : ${money(p.retailPrice)}**`);

    if (p.imageKey) {
      try {
        const bytes = await storage.get(p.imageKey);
        const fileName = `menu-${p.id}.${extOf(p.imageName)}`;
        files.push(new AttachmentBuilder(bytes, { name: fileName }));
        embed.setImage(`attachment://${fileName}`);
      } catch (err) {
        logger.warn({ err, productId: p.id }, 'Image produit illisible — menu sans visuel');
      }
    }
    embeds.push(embed);
  }

  if (products.length === 0) {
    intro.setDescription(`${INTRO}\n\n_Le menu est en cours de préparation…_`);
  }

  return { embeds, files };
}

/** Publie / met a jour le menu public dans son salon dedie. */
export async function publishMenuBoard(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelMenuBoard) return;

  const channel = await client.channels.fetch(config.channelMenuBoard).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    logger.warn({ channelId: config.channelMenuBoard }, 'Salon menu introuvable');
    return;
  }
  const payload = await buildMenuBoard(guildConfigId);

  if (config.msgMenuBoard) {
    try {
      const msg = await (channel as TextBasedChannel).messages.fetch(config.msgMenuBoard);
      // attachments: [] purge les anciennes images avant de re-attacher les neuves.
      await msg.edit({ ...payload, attachments: [] });
      return;
    } catch {
      /* message supprime -> on recree */
    }
  }
  const created = await channel.send(payload);
  await prisma.guildConfig.update({
    where: { id: guildConfigId },
    data: { msgMenuBoard: created.id },
  });
}
