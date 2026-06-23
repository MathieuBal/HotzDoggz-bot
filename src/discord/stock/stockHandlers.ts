import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { scheduleDashboardUpdate } from '../../modules/dashboards/scheduler.js';
import {
  getEmployeeByDiscordId,
  getGuildConfigByGuildId,
} from '../../modules/employees/employeeService.js';
import { formatCountdown } from '../../modules/stock/perishable.js';
import { addSaucisses, transformToHotdogs } from '../../modules/stock/stockService.js';
import { StockFieldId, StockModalId, StockSelectId } from '../components/ids.js';

async function ensureEmployee(
  interaction: StringSelectMenuInteraction | ModalSubmitInteraction,
): Promise<{ configId: string } | null> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Serveur requis.', flags: MessageFlags.Ephemeral });
    return null;
  }
  const config = await getGuildConfigByGuildId(interaction.guild.id);
  if (!config) {
    await interaction.reply({ content: 'Configuration absente.', flags: MessageFlags.Ephemeral });
    return null;
  }
  const employee = await getEmployeeByDiscordId(interaction.user.id);
  if (!employee || employee.guildConfigId !== config.id || employee.status !== 'ACTIVE') {
    await interaction.reply({
      content: 'Réservé aux employés actifs.',
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return { configId: config.id };
}

/** Selection d'un vehicule (ramasser / transformer) -> ouvre un modal quantite. */
export async function handleStockSelect(
  interaction: StringSelectMenuInteraction,
): Promise<boolean> {
  const isRamasser = interaction.customId === StockSelectId.RAMASSER;
  const isTransformer = interaction.customId === StockSelectId.TRANSFORMER;
  if (!isRamasser && !isTransformer) return false;

  if (!(await ensureEmployee(interaction))) return true;
  const vehicleId = interaction.values[0];
  if (!vehicleId) {
    await interaction.reply({ content: 'Sélection vide.', flags: MessageFlags.Ephemeral });
    return true;
  }
  const base = isRamasser ? StockModalId.RAMASSER : StockModalId.TRANSFORMER;
  const modal = new ModalBuilder()
    .setCustomId(`${base}:${vehicleId}`)
    .setTitle(isRamasser ? 'Ramasser des saucisses' : 'Transformer en hot dogs')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(StockFieldId.QTE)
          .setLabel(isRamasser ? 'Combien de saucisses ?' : 'Combien transformer ?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
  await interaction.showModal(modal);
  return true;
}

/** Soumission du modal quantite -> execute l'operation et rafraichit le board. */
export async function handleStockModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const isRamasser = interaction.customId.startsWith(`${StockModalId.RAMASSER}:`);
  const isTransformer = interaction.customId.startsWith(`${StockModalId.TRANSFORMER}:`);
  if (!isRamasser && !isTransformer) return false;

  const ctx = await ensureEmployee(interaction);
  if (!ctx) return true;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const base = isRamasser ? StockModalId.RAMASSER : StockModalId.TRANSFORMER;
  const vehicleId = interaction.customId.slice(base.length + 1);
  const qty = Number(interaction.fields.getTextInputValue(StockFieldId.QTE).trim());
  if (!Number.isInteger(qty) || qty < 1) {
    await interaction.editReply('Quantité invalide (entier positif).');
    return true;
  }

  if (isRamasser) {
    const res = await addSaucisses(ctx.configId, vehicleId, qty, interaction.user.id);
    if (res.ok) scheduleDashboardUpdate(interaction.client, ctx.configId);
    await interaction.editReply(
      res.ok
        ? `🥩 ${qty} saucisse(s) ajoutée(s) au **${res.data.vehicle.make} ${res.data.vehicle.plate}** (total : ${res.data.vehicle.saucisses}).`
        : `Échec : ${res.reason}`,
    );
    return true;
  }

  const res = await transformToHotdogs(ctx.configId, vehicleId, qty, interaction.user.id);
  if (res.ok) scheduleDashboardUpdate(interaction.client, ctx.configId);
  await interaction.editReply(
    res.ok
      ? `🌭 ${qty} hot dog(s) produit(s) ! ⏳ Périment dans **${formatCountdown(res.data.expiresAt)}**. Saucisses restantes : ${res.data.vehicle.saucisses}.`
      : `Échec : ${res.reason}`,
  );
  return true;
}
