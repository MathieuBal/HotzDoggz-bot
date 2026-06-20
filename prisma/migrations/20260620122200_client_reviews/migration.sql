-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('VISIBLE', 'REMOVED');

-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN     "channelReviews" TEXT,
ADD COLUMN     "msgReviewBoard" TEXT;

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "authorDiscordId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeName" TEXT,
    "messageId" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Review_messageId_key" ON "Review"("messageId");

-- CreateIndex
CREATE INDEX "Review_guildConfigId_status_idx" ON "Review"("guildConfigId", "status");

-- CreateIndex
CREATE INDEX "Review_authorDiscordId_createdAt_idx" ON "Review"("authorDiscordId", "createdAt");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
