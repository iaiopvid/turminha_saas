ALTER TABLE `journal_entries` ADD COLUMN `idempotencyKey` CHAR(36) NULL;
CREATE UNIQUE INDEX `journal_entries_tenantId_authorMembershipId_idempotencyKey_key` ON `journal_entries` (`tenantId`, `authorMembershipId`, `idempotencyKey`);
