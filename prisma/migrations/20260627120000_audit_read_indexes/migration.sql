-- Lecture du journal d'audit (/journal, /export audit) : par serveur trie par
-- date, et filtrage par auteur. L'ecriture existait deja ; on indexe la lecture.

-- CreateIndex
CREATE INDEX "AuditLog_guildConfigId_createdAt_idx" ON "AuditLog"("guildConfigId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_guildConfigId_authorDiscordId_createdAt_idx" ON "AuditLog"("guildConfigId", "authorDiscordId", "createdAt");
