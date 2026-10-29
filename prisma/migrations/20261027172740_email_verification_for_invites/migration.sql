-- AlterTable
ALTER TABLE `users` ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `email_verifications` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `userId` VARCHAR(30) NOT NULL,
    `invitationId` VARCHAR(30) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `email_verifications_userId_key`(`userId`),
    UNIQUE INDEX `email_verifications_tokenHash_key`(`tokenHash`),
    INDEX `email_verifications_tenantId_expiresAt_idx`(`tenantId`, `expiresAt`),
    UNIQUE INDEX `email_verifications_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `email_verifications_tenantId_invitationId_key`(`tenantId`, `invitationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `email_verifications` ADD CONSTRAINT `email_verifications_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_verifications` ADD CONSTRAINT `email_verifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_verifications` ADD CONSTRAINT `email_verifications_tenantId_invitationId_fkey` FOREIGN KEY (`tenantId`, `invitationId`) REFERENCES `invitations`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
