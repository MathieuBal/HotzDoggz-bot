-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AccountingWeekStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('SOUMISE', 'INCOMPLETE', 'EN_VERIFICATION', 'VALIDEE', 'INTEGREE_A_LA_PAIE', 'PAYEE', 'REFUSEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('COFFRE_PLEIN', 'COFFRE_VIDE');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('SALE_REVENUE', 'SALARY_LIABILITY', 'RESERVE_ALLOCATION', 'BONUS_ALLOCATION', 'DIRECTION_ALLOCATION', 'PAYMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ForumTagKey" AS ENUM ('NOUVELLE_VENTE', 'A_VERIFIER', 'A_COMPLETER', 'VALIDEE', 'PAYEE', 'REFUSEE');

-- CreateTable
CREATE TABLE "GuildConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "roleDirecteur" TEXT,
    "roleCoDirecteur" TEXT,
    "roleChefEquipe" TEXT,
    "roleExperimente" TEXT,
    "roleNovice" TEXT,
    "roleStagiaire" TEXT,
    "channelControl" TEXT,
    "channelAccounting" TEXT,
    "channelPayroll" TEXT,
    "channelLogs" TEXT,
    "channelWeeklyBoard" TEXT,
    "msgWeeklyEmployees" TEXT,
    "msgAccounting" TEXT,
    "msgPayroll" TEXT,
    "msgSalaryGrid" TEXT,
    "pnjUnitPrice" INTEGER NOT NULL DEFAULT 210,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeRate" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ratePerUnit" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumTag" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "forumChannelId" TEXT NOT NULL,
    "key" "ForumTagKey" NOT NULL,
    "discordTagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "nomRP" TEXT NOT NULL,
    "casierForumId" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingWeek" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "AccountingWeekStatus" NOT NULL DEFAULT 'OPEN',
    "openGuildKey" TEXT,
    "totalRevenue" INTEGER,
    "totalSalaries" INTEGER,
    "reserve" INTEGER,
    "distributable" INTEGER,
    "bonus" INTEGER,
    "directorShare" INTEGER,
    "coDirectorShare" INTEGER,
    "bestEmployeeId" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedByDiscordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "controlThreadId" TEXT,
    "declaredQuantity" INTEGER NOT NULL,
    "validatedQuantity" INTEGER,
    "gradeSnapshot" TEXT,
    "gradeRoleIdSnapshot" TEXT,
    "salaryRateSnapshot" INTEGER,
    "pnjUnitPriceSnapshot" INTEGER,
    "status" "SaleStatus" NOT NULL DEFAULT 'SOUMISE',
    "declaredAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "controllerDiscordId" TEXT,
    "validatedAt" TIMESTAMP(3),
    "validatedByDiscordId" TEXT,
    "verificationNote" TEXT,
    "refusalReason" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleAttachment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
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

    CONSTRAINT "SaleAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleStatusHistory" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "fromStatus" "SaleStatus",
    "toStatus" "SaleStatus" NOT NULL,
    "authorDiscordId" TEXT,
    "reason" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payroll" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "salaryAmount" INTEGER NOT NULL,
    "bonusAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "payerDiscordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "weekId" TEXT,
    "saleId" TEXT,
    "employeeId" TEXT,
    "payrollId" TEXT,
    "description" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT,
    "action" TEXT NOT NULL,
    "authorDiscordId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "channelId" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuildConfig_guildId_key" ON "GuildConfig"("guildId");

-- CreateIndex
CREATE INDEX "GradeRate_guildConfigId_roleId_idx" ON "GradeRate"("guildConfigId", "roleId");

-- CreateIndex
CREATE INDEX "GradeRate_roleId_validTo_idx" ON "GradeRate"("roleId", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "ForumTag_forumChannelId_key_key" ON "ForumTag"("forumChannelId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_discordUserId_key" ON "Employee"("discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_casierForumId_key" ON "Employee"("casierForumId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingWeek_openGuildKey_key" ON "AccountingWeek"("openGuildKey");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_reference_key" ON "Sale"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_threadId_key" ON "Sale"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_controlThreadId_key" ON "Sale"("controlThreadId");

-- CreateIndex
CREATE INDEX "Sale_weekId_status_idx" ON "Sale"("weekId", "status");

-- CreateIndex
CREATE INDEX "Sale_employeeId_weekId_idx" ON "Sale"("employeeId", "weekId");

-- CreateIndex
CREATE INDEX "SaleAttachment_saleId_idx" ON "SaleAttachment"("saleId");

-- CreateIndex
CREATE INDEX "SaleStatusHistory_saleId_idx" ON "SaleStatusHistory"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "Payroll_employeeId_weekId_key" ON "Payroll"("employeeId", "weekId");

-- CreateIndex
CREATE INDEX "LedgerEntry_weekId_type_idx" ON "LedgerEntry"("weekId", "type");

-- CreateIndex
CREATE INDEX "LedgerEntry_saleId_idx" ON "LedgerEntry"("saleId");

-- CreateIndex
CREATE INDEX "AuditLog_correlationId_idx" ON "AuditLog"("correlationId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "GradeRate" ADD CONSTRAINT "GradeRate_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumTag" ADD CONSTRAINT "ForumTag_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingWeek" ADD CONSTRAINT "AccountingWeek_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "AccountingWeek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleAttachment" ADD CONSTRAINT "SaleAttachment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleStatusHistory" ADD CONSTRAINT "SaleStatusHistory_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "AccountingWeek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "AccountingWeek"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
