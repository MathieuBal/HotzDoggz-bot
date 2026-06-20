-- AlterTable
ALTER TABLE "ClientOrder" ADD COLUMN     "partnerId" TEXT;

-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN     "channelPartnerships" TEXT,
ADD COLUMN     "msgPartnershipBoard" TEXT;

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objectiveTarget" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Partner_guildConfigId_active_idx" ON "Partner"("guildConfigId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_guildConfigId_name_key" ON "Partner"("guildConfigId", "name");

-- CreateIndex
CREATE INDEX "ClientOrder_partnerId_idx" ON "ClientOrder"("partnerId");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOrder" ADD CONSTRAINT "ClientOrder_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
