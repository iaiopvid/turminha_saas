-- Allow independent, timestamped verification retries for one invited user.
-- Replace the unique child indexes with non-unique indexes, preserving the FKs.
ALTER TABLE `email_verifications` DROP FOREIGN KEY `email_verifications_userId_fkey`;
DROP INDEX `email_verifications_userId_key` ON `email_verifications`;
CREATE INDEX `email_verifications_userId_createdAt_idx`
  ON `email_verifications` (`userId`, `createdAt`);
ALTER TABLE `email_verifications` ADD CONSTRAINT `email_verifications_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `email_verifications` DROP FOREIGN KEY `email_verifications_tenantId_invitationId_fkey`;
DROP INDEX `email_verifications_tenantId_invitationId_key` ON `email_verifications`;
CREATE INDEX `email_verifications_tenantId_invitationId_idx`
  ON `email_verifications` (`tenantId`, `invitationId`);
ALTER TABLE `email_verifications` ADD CONSTRAINT `email_verifications_tenantId_invitationId_fkey`
  FOREIGN KEY (`tenantId`, `invitationId`) REFERENCES `invitations`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
