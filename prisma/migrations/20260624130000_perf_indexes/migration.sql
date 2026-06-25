-- CreateIndex
CREATE INDEX "AccountingWeek_guildConfigId_status_endAt_idx" ON "AccountingWeek"("guildConfigId", "status", "endAt");

-- CreateIndex
CREATE INDEX "Sale_guildConfigId_employeeId_createdAt_idx" ON "Sale"("guildConfigId", "employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_guildConfigId_status_submittedAt_idx" ON "Sale"("guildConfigId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "Employee_guildConfigId_status_idx" ON "Employee"("guildConfigId", "status");
