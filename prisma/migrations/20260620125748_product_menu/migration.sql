-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "retailPrice" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_guildConfigId_active_idx" ON "Product"("guildConfigId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Product_guildConfigId_name_key" ON "Product"("guildConfigId", "name");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
