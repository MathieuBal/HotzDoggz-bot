-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN     "channelPlanning" TEXT,
ADD COLUMN     "msgPlanningBoard" TEXT;

-- CreateTable
CREATE TABLE "OrderSignup" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderSignup_orderId_idx" ON "OrderSignup"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderSignup_orderId_employeeId_key" ON "OrderSignup"("orderId", "employeeId");

-- AddForeignKey
ALTER TABLE "OrderSignup" ADD CONSTRAINT "OrderSignup_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ClientOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSignup" ADD CONSTRAINT "OrderSignup_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
