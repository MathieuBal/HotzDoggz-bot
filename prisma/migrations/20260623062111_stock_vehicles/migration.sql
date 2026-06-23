-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN     "channelStock" TEXT,
ADD COLUMN     "msgStockBoard" TEXT;

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "name" TEXT,
    "make" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "saucisses" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotdogBatch" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "quantity" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "producedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByDiscordId" TEXT,

    CONSTRAINT "HotdogBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vehicle_guildConfigId_active_idx" ON "Vehicle"("guildConfigId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_guildConfigId_plate_key" ON "Vehicle"("guildConfigId", "plate");

-- CreateIndex
CREATE INDEX "HotdogBatch_guildConfigId_remaining_expiresAt_idx" ON "HotdogBatch"("guildConfigId", "remaining", "expiresAt");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotdogBatch" ADD CONSTRAINT "HotdogBatch_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotdogBatch" ADD CONSTRAINT "HotdogBatch_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
