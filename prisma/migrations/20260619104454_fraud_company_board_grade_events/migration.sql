-- CreateEnum
CREATE TYPE "SaleRisk" AS ENUM ('CLEAN', 'SUSPECT', 'FLAGGED');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "lastGradeLabel" TEXT,
ADD COLUMN     "lastGradeRate" INTEGER,
ADD COLUMN     "lastGradeRoleId" TEXT;

-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN     "msgCompanyBoard" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "riskLevel" "SaleRisk" NOT NULL DEFAULT 'CLEAN',
ADD COLUMN     "riskReasons" TEXT;

-- CreateTable
CREATE TABLE "EmployeeGradeEvent" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fromLabel" TEXT,
    "fromRate" INTEGER,
    "toLabel" TEXT NOT NULL,
    "toRate" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeGradeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeGradeEvent_guildConfigId_createdAt_idx" ON "EmployeeGradeEvent"("guildConfigId", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeGradeEvent_employeeId_idx" ON "EmployeeGradeEvent"("employeeId");

-- CreateIndex
CREATE INDEX "SaleAttachment_sha256_idx" ON "SaleAttachment"("sha256");

-- AddForeignKey
ALTER TABLE "EmployeeGradeEvent" ADD CONSTRAINT "EmployeeGradeEvent_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeGradeEvent" ADD CONSTRAINT "EmployeeGradeEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
