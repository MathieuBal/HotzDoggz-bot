-- Salon + message permanent du tableau « Palmarès » (classement + prestige).
-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN "channelPalmares" TEXT;
ALTER TABLE "GuildConfig" ADD COLUMN "msgPalmares" TEXT;
