-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN     "channelGarage" TEXT,
ADD COLUMN     "msgGarageBoard" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "capacity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "photoKey" TEXT,
ADD COLUMN     "photoName" TEXT;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
