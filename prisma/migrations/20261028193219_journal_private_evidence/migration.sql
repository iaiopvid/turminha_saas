-- CreateTable
CREATE TABLE `journal_evidence` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `journalEntryId` VARCHAR(30) NOT NULL,
    `uploadedByMembershipId` VARCHAR(30) NOT NULL,
    `storageKey` VARCHAR(300) NOT NULL,
    `originalFilename` VARCHAR(255) NOT NULL,
    `contentType` VARCHAR(100) NOT NULL,
    `byteSize` INTEGER NOT NULL,
    `checksumSha256` CHAR(64) NOT NULL,
    `scanStatus` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    `status` VARCHAR(24) NOT NULL DEFAULT 'QUARANTINED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `journal_evidence_tenantId_journalEntryId_createdAt_idx`(`tenantId`, `journalEntryId`, `createdAt`),
    INDEX `journal_evidence_tenantId_uploadedByMembershipId_createdAt_idx`(`tenantId`, `uploadedByMembershipId`, `createdAt`),
    UNIQUE INDEX `journal_evidence_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journal_evidence_scan_jobs` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `journalEvidenceId` VARCHAR(30) NOT NULL,
    `storageKey` VARCHAR(300) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` VARCHAR(300) NULL,
    `lockedUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,

    INDEX `journal_evidence_scan_jobs_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    UNIQUE INDEX `journal_evidence_scan_jobs_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `journal_evidence` ADD CONSTRAINT `journal_evidence_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_evidence` ADD CONSTRAINT `journal_evidence_tenantId_journalEntryId_fkey` FOREIGN KEY (`tenantId`, `journalEntryId`) REFERENCES `journal_entries`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_evidence` ADD CONSTRAINT `journal_evidence_tenantId_uploadedByMembershipId_fkey` FOREIGN KEY (`tenantId`, `uploadedByMembershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_evidence_scan_jobs` ADD CONSTRAINT `journal_evidence_scan_jobs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_evidence_scan_jobs` ADD CONSTRAINT `journal_evidence_scan_jobs_tenantId_journalEvidenceId_fkey` FOREIGN KEY (`tenantId`, `journalEvidenceId`) REFERENCES `journal_evidence`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
