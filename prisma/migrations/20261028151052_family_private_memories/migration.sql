-- AlterTable
ALTER TABLE `media_assets` ADD COLUMN `studentId` VARCHAR(30) NULL;

-- CreateTable
CREATE TABLE `media_submissions` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `mediaAssetId` VARCHAR(30) NOT NULL,
    `studentId` VARCHAR(30) NOT NULL,
    `submittedByMembershipId` VARCHAR(30) NOT NULL,
    `status` ENUM('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'WITHDRAWN') NOT NULL DEFAULT 'SUBMITTED',
    `intendedAudience` VARCHAR(40) NOT NULL DEFAULT 'SCHOOL_REVIEW',
    `reviewerMembershipId` VARCHAR(30) NULL,
    `reviewComment` VARCHAR(1000) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `media_submissions_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `media_submissions_tenantId_studentId_status_createdAt_idx`(`tenantId`, `studentId`, `status`, `createdAt`),
    INDEX `media_submissions_tenantId_submittedByMembershipId_createdAt_idx`(`tenantId`, `submittedByMembershipId`, `createdAt`),
    UNIQUE INDEX `media_submissions_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media_consents` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `mediaAssetId` VARCHAR(30) NOT NULL,
    `membershipId` VARCHAR(30) NOT NULL,
    `purpose` ENUM('PRIVATE_STORAGE', 'SCHOOL_REVIEW') NOT NULL,
    `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    INDEX `media_consents_tenantId_membershipId_purpose_revokedAt_idx`(`tenantId`, `membershipId`, `purpose`, `revokedAt`),
    UNIQUE INDEX `media_consents_tenantId_mediaAssetId_membershipId_purpose_key`(`tenantId`, `mediaAssetId`, `membershipId`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `storage_outbox` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `idempotencyKey` VARCHAR(180) NOT NULL,
    `storageKey` VARCHAR(300) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'DONE') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` VARCHAR(300) NULL,
    `lockedUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,

    INDEX `storage_outbox_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    UNIQUE INDEX `storage_outbox_tenantId_idempotencyKey_key`(`tenantId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `media_assets_tenantId_studentId_uploadedByMembershipId_statu_idx` ON `media_assets`(`tenantId`, `studentId`, `uploadedByMembershipId`, `status`, `createdAt`);

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_tenantId_studentId_fkey` FOREIGN KEY (`tenantId`, `studentId`) REFERENCES `students`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_submissions` ADD CONSTRAINT `media_submissions_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_submissions` ADD CONSTRAINT `media_submissions_tenantId_mediaAssetId_fkey` FOREIGN KEY (`tenantId`, `mediaAssetId`) REFERENCES `media_assets`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_submissions` ADD CONSTRAINT `media_submissions_tenantId_studentId_fkey` FOREIGN KEY (`tenantId`, `studentId`) REFERENCES `students`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_submissions` ADD CONSTRAINT `media_submissions_tenantId_submittedByMembershipId_fkey` FOREIGN KEY (`tenantId`, `submittedByMembershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_submissions` ADD CONSTRAINT `media_submissions_tenantId_reviewerMembershipId_fkey` FOREIGN KEY (`tenantId`, `reviewerMembershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_consents` ADD CONSTRAINT `media_consents_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_consents` ADD CONSTRAINT `media_consents_tenantId_mediaAssetId_fkey` FOREIGN KEY (`tenantId`, `mediaAssetId`) REFERENCES `media_assets`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_consents` ADD CONSTRAINT `media_consents_tenantId_membershipId_fkey` FOREIGN KEY (`tenantId`, `membershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `storage_outbox` ADD CONSTRAINT `storage_outbox_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
