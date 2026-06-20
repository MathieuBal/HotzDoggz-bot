-- CreateEnum
CREATE TYPE "ClientOrderStatus" AS ENUM ('OUVERTE', 'LIVREE', 'PAYEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "OrderContributionStatus" AS ENUM ('ACTIVE', 'ANNULEE');

-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN     "channelOrders" TEXT,
ADD COLUMN     "msgOrdersBoard" TEXT;

-- CreateTable
CREATE TABLE "ClientOrder" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "description" TEXT,
    "targetQuantity" INTEGER NOT NULL,
    "negotiatedPrice" INTEGER NOT NULL,
    "deadline" TIMESTAMP(3),
    "status" "ClientOrderStatus" NOT NULL DEFAULT 'OUVERTE',
    "deliveredAt" TIMESTAMP(3),
    "deliveredByDiscordId" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentCollectedByDiscordId" TEXT,
    "paymentProofKey" TEXT,
    "weekId" TEXT,
    "createdByDiscordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderContribution" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "OrderContributionStatus" NOT NULL DEFAULT 'ACTIVE',
    "gradeSnapshot" TEXT,
    "gradeRoleIdSnapshot" TEXT,
    "salaryRateSnapshot" INTEGER,
    "riskLevel" "SaleRisk" NOT NULL DEFAULT 'CLEAN',
    "riskReasons" TEXT,
    "recordedByDiscordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderContributionAttachment" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "discordMessageId" TEXT NOT NULL,
    "discordAttachmentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "discordUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderContributionAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientOrder_reference_key" ON "ClientOrder"("reference");

-- CreateIndex
CREATE INDEX "ClientOrder_guildConfigId_status_idx" ON "ClientOrder"("guildConfigId", "status");

-- CreateIndex
CREATE INDEX "ClientOrder_weekId_idx" ON "ClientOrder"("weekId");

-- CreateIndex
CREATE INDEX "OrderContribution_orderId_idx" ON "OrderContribution"("orderId");

-- CreateIndex
CREATE INDEX "OrderContribution_employeeId_idx" ON "OrderContribution"("employeeId");

-- CreateIndex
CREATE INDEX "OrderContributionAttachment_contributionId_idx" ON "OrderContributionAttachment"("contributionId");

-- CreateIndex
CREATE INDEX "OrderContributionAttachment_sha256_idx" ON "OrderContributionAttachment"("sha256");

-- AddForeignKey
ALTER TABLE "ClientOrder" ADD CONSTRAINT "ClientOrder_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOrder" ADD CONSTRAINT "ClientOrder_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "AccountingWeek"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderContribution" ADD CONSTRAINT "OrderContribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ClientOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderContribution" ADD CONSTRAINT "OrderContribution_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderContributionAttachment" ADD CONSTRAINT "OrderContributionAttachment_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "OrderContribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
