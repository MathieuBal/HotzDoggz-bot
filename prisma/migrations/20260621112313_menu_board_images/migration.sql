-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN     "channelMenuBoard" TEXT,
ADD COLUMN     "msgMenuBoard" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "description" TEXT,
ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "imageName" TEXT;
