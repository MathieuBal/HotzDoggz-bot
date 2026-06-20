-- CreateTable
CREATE TABLE "DirectSale" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "weekId" TEXT,
    "employeeId" TEXT NOT NULL,
    "buyerName" TEXT,
    "threadId" TEXT,
    "controlThreadId" TEXT,
    "status" "SaleStatus" NOT NULL DEFAULT 'SOUMISE',
    "gradeSnapshot" TEXT,
    "gradeRoleIdSnapshot" TEXT,
    "salaryRateSnapshot" INTEGER,
    "riskLevel" "SaleRisk" NOT NULL DEFAULT 'CLEAN',
    "riskReasons" TEXT,
    "declaredAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "controllerDiscordId" TEXT,
    "validatedByDiscordId" TEXT,
    "validatedAt" TIMESTAMP(3),
    "verificationNote" TEXT,
    "refusalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectSaleLine" (
    "id" TEXT NOT NULL,
    "directSaleId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "declaredQuantity" INTEGER NOT NULL,
    "validatedQuantity" INTEGER,

    CONSTRAINT "DirectSaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectSaleAttachment" (
    "id" TEXT NOT NULL,
    "directSaleId" TEXT NOT NULL,
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

    CONSTRAINT "DirectSaleAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DirectSale_reference_key" ON "DirectSale"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "DirectSale_threadId_key" ON "DirectSale"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectSale_controlThreadId_key" ON "DirectSale"("controlThreadId");

-- CreateIndex
CREATE INDEX "DirectSale_weekId_status_idx" ON "DirectSale"("weekId", "status");

-- CreateIndex
CREATE INDEX "DirectSale_employeeId_weekId_idx" ON "DirectSale"("employeeId", "weekId");

-- CreateIndex
CREATE INDEX "DirectSaleLine_directSaleId_idx" ON "DirectSaleLine"("directSaleId");

-- CreateIndex
CREATE INDEX "DirectSaleAttachment_directSaleId_idx" ON "DirectSaleAttachment"("directSaleId");

-- CreateIndex
CREATE INDEX "DirectSaleAttachment_sha256_idx" ON "DirectSaleAttachment"("sha256");

-- AddForeignKey
ALTER TABLE "DirectSale" ADD CONSTRAINT "DirectSale_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSale" ADD CONSTRAINT "DirectSale_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "AccountingWeek"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSale" ADD CONSTRAINT "DirectSale_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSaleLine" ADD CONSTRAINT "DirectSaleLine_directSaleId_fkey" FOREIGN KEY ("directSaleId") REFERENCES "DirectSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSaleAttachment" ADD CONSTRAINT "DirectSaleAttachment_directSaleId_fkey" FOREIGN KEY ("directSaleId") REFERENCES "DirectSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
