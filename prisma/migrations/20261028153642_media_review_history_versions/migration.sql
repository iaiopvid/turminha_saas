-- AlterTable
ALTER TABLE `media_submissions` ADD COLUMN `supersedesId` VARCHAR(30) NULL,
    ADD COLUMN `threadId` VARCHAR(30) NULL,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `media_review_events` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `submissionId` VARCHAR(30) NOT NULL,
    `actorMembershipId` VARCHAR(30) NOT NULL,
    `actorDisplayName` VARCHAR(100) NOT NULL,
    `actorRole` ENUM('SCHOOL_ADMIN', 'COORDINATOR', 'TEACHER', 'ASSISTANT', 'SECRETARY', 'BILLING_MANAGER', 'GUARDIAN') NOT NULL,
    `fromStatus` ENUM('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'WITHDRAWN') NULL,
    `toStatus` ENUM('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'WITHDRAWN') NOT NULL,
    `comment` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `mediaAssetId` VARCHAR(30) NULL,

    INDEX `media_review_events_tenantId_submissionId_createdAt_idx`(`tenantId`, `submissionId`, `createdAt`),
    UNIQUE INDEX `media_review_events_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `media_submissions_tenantId_supersedesId_idx` ON `media_submissions`(`tenantId`, `supersedesId`);

-- CreateIndex
CREATE INDEX `media_submissions_tenantId_threadId_version_idx` ON `media_submissions`(`tenantId`, `threadId`, `version`);

-- AddForeignKey
ALTER TABLE `media_submissions` ADD CONSTRAINT `media_submissions_tenantId_supersedesId_fkey` FOREIGN KEY (`tenantId`, `supersedesId`) REFERENCES `media_submissions`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_review_events` ADD CONSTRAINT `media_review_events_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_review_events` ADD CONSTRAINT `media_review_events_tenantId_submissionId_fkey` FOREIGN KEY (`tenantId`, `submissionId`) REFERENCES `media_submissions`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_review_events` ADD CONSTRAINT `media_review_events_tenantId_actorMembershipId_fkey` FOREIGN KEY (`tenantId`, `actorMembershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_review_events` ADD CONSTRAINT `media_review_events_mediaAssetId_fkey` FOREIGN KEY (`mediaAssetId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
