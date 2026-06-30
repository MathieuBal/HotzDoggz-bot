-- Salon + message permanent du trombinoscope "gestion des employés" (direction).
ALTER TABLE "GuildConfig" ADD COLUMN "channelStaff" TEXT;
ALTER TABLE "GuildConfig" ADD COLUMN "msgStaffBoard" TEXT;
