import {
  ActionRowBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type BaseMessageOptions,
  type Client,
  type TextBasedChannel,
} from 'discord.js';
import { prisma } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { getObjectStorage } from '../../infrastructure/object-storage/factory.js';
import { getGarage, type GarageVehicle } from '../../modules/garage/garageService.js';
import { GarageId } from '../components/ids.js';

const nf = new Intl.NumberFormat('fr-FR');
const MAX_PHOTOS = 8; // header + 8 fiches = 9 embeds (max 10)

function extOf(name: string | null): string {
  const e = name?.split('.').pop()?.toLowerCase();
  return e && /^[a-z0-9]{1,5}$/.test(e) ? e : 'png';
}

function vehicleTitle(v: GarageVehicle): string {
  return `${v.name ? `${v.name} — ` : ''}${v.make} ${v.plate}`;
}

/** Construit le catalogue garage : galerie des dispos (photos) + roster attribués. */
export async function buildGarageMessage(guildConfigId: string): Promise<BaseMessageOptions> {
  const garage = await getGarage(guildConfigId);
  const storage = getObjectStorage();

  const header = new EmbedBuilder()
    .setTitle('🏛️ Garage HotzDoggz')
    .setColor(0x34495e)
    .setDescription(
      `**${garage.total}** véhicule(s) · 🎁 **${garage.available.length}** disponible(s) à donner · ` +
        `👤 **${garage.total - garage.available.length}** attribué(s)`,
    )
    .setTimestamp(new Date());

  const embeds: EmbedBuilder[] = [header];
  const files: AttachmentBuilder[] = [];

  // Galerie des véhicules DISPONIBLES (avec photo) — priorité direction.
  for (const v of garage.available.slice(0, MAX_PHOTOS)) {
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`🎁 ${vehicleTitle(v)}`)
      .addFields(
        { name: 'Poids transportable', value: `${nf.format(v.capacity)}`, inline: true },
        { name: 'Saucisses', value: `${nf.format(v.saucisses)}`, inline: true },
        { name: 'Statut', value: '🟢 Disponible', inline: true },
      );
    if (v.photoKey) {
      try {
        const bytes = await storage.get(v.photoKey);
        const fileName = `vehicle-${v.id}.${extOf(v.photoName)}`;
        files.push(new AttachmentBuilder(bytes, { name: fileName }));
        embed.setImage(`attachment://${fileName}`);
      } catch (err) {
        logger.warn({ err, vehicleId: v.id }, 'Photo vehicule illisible');
      }
    }
    embeds.push(embed);
  }
  if (garage.available.length === 0) {
    header.addFields({ name: '🎁 Disponibles', value: '_Aucun véhicule disponible à donner._' });
  } else if (garage.available.length > MAX_PHOTOS) {
    header.addFields({
      name: 'ℹ️',
      value: `+${garage.available.length - MAX_PHOTOS} autre(s) véhicule(s) disponible(s).`,
    });
  }

  // Roster des véhicules ATTRIBUÉS (texte, par propriétaire).
  if (garage.byOwner.length > 0) {
    const roster = garage.byOwner
      .map((g) => {
        const list = g.vehicles
          .map((v) => `• ${vehicleTitle(v)} — 📦 ${nf.format(v.capacity)} · 🥩 ${nf.format(v.saucisses)}`)
          .join('\n');
        const who = g.ownerDiscordId ? `<@${g.ownerDiscordId}>` : g.ownerNomRP;
        return `**${who}** (${g.vehicles.length})\n${list}`;
      })
      .join('\n\n')
      .slice(0, 4000);
    embeds.push(
      new EmbedBuilder().setColor(0x7f8c8d).setTitle('👤 Véhicules attribués').setDescription(roster),
    );
  }

  header.setFooter({ text: 'Direction : « Attribuer » ci-dessous pour donner un véhicule disponible' });

  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];

  // Menu « ouvrir un véhicule » (tout le monde) : ouvre la carte ; si c'est le
  // tien (ou direction), des boutons permettent de gérer ton stock direct.
  const all = [...garage.available, ...garage.byOwner.flatMap((g) => g.vehicles)];
  if (all.length > 0) {
    const open = new StringSelectMenuBuilder()
      .setCustomId(GarageId.OPEN)
      .setPlaceholder('🚗 Ouvrir un véhicule (et gérer mon stock)…')
      .addOptions(
        all.slice(0, 25).map((v) => ({
          label: vehicleTitle(v).slice(0, 100),
          description: `${v.ownerNomRP ? `à ${v.ownerNomRP}` : 'disponible'} · ${v.saucisses} saucisses`.slice(0, 100),
          value: v.id,
        })),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(open));
  }

  // Menu d'attribution (véhicules disponibles) — direction.
  if (garage.available.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(GarageId.PICK)
      .setPlaceholder('🎁 Attribuer un véhicule disponible…')
      .addOptions(
        garage.available.slice(0, 25).map((v) => ({
          label: vehicleTitle(v).slice(0, 100),
          description: `Poids ${v.capacity}`.slice(0, 100),
          value: v.id,
        })),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }

  return { embeds, files, components };
}

/** Publie / met a jour le catalogue garage dans son salon dedie. */
export async function publishGarageBoard(client: Client, guildConfigId: string): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
  if (!config?.channelGarage) return;

  const channel = await client.channels.fetch(config.channelGarage).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    logger.warn({ channelId: config.channelGarage }, 'Salon garage introuvable');
    return;
  }
  const payload = await buildGarageMessage(guildConfigId);

  if (config.msgGarageBoard) {
    try {
      const msg = await (channel as TextBasedChannel).messages.fetch(config.msgGarageBoard);
      await msg.edit({ ...payload, attachments: [] });
      return;
    } catch {
      /* message supprime -> on recree */
    }
  }
  const created = await channel.send(payload);
  await prisma.guildConfig.update({
    where: { id: guildConfigId },
    data: { msgGarageBoard: created.id },
  });
}
