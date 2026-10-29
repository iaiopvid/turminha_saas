-- CreateTable
CREATE TABLE `journal_evidence_family_shares` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `journalEvidenceId` VARCHAR(30) NOT NULL,
    `enrollmentId` VARCHAR(30) NOT NULL,
    `requestedByMembershipId` VARCHAR(30) NOT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,

    INDEX `journal_evidence_family_shares_tenantId_enrollmentId_closedA_idx`(`tenantId`, `enrollmentId`, `closedAt`, `requestedAt`),
    INDEX `journal_evidence_family_shares_tenantId_journalEvidenceId_cl_idx`(`tenantId`, `journalEvidenceId`, `closedAt`),
    UNIQUE INDEX `journal_evidence_family_shares_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journal_evidence_family_consents` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `shareId` VARCHAR(30) NOT NULL,
    `membershipId` VARCHAR(30) NOT NULL,
    `action` ENUM('GRANTED', 'REVOKED') NOT NULL,
    `termsVersion` VARCHAR(40) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `journal_evidence_family_consents_tenantId_shareId_membership_idx`(`tenantId`, `shareId`, `membershipId`, `createdAt`),
    INDEX `journal_evidence_family_consents_tenantId_membershipId_creat_idx`(`tenantId`, `membershipId`, `createdAt`),
    UNIQUE INDEX `journal_evidence_family_consents_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `journal_evidence_family_shares` ADD CONSTRAINT `journal_evidence_family_shares_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_evidence_family_shares` ADD CONSTRAINT `journal_evidence_family_shares_tenantId_journalEvidenceId_fkey` FOREIGN KEY (`tenantId`, `journalEvidenceId`) REFERENCES `journal_evidence`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_evidence_family_shares` ADD CONSTRAINT `journal_evidence_family_shares_tenantId_enrollmentId_fkey` FOREIGN KEY (`tenantId`, `enrollmentId`) REFERENCES `enrollments`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_evidence_family_shares` ADD CONSTRAINT `journal_evidence_family_shares_tenantId_requestedByMembersh_fkey` FOREIGN KEY (`tenantId`, `requestedByMembershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_evidence_family_consents` ADD CONSTRAINT `journal_evidence_family_consents_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_evidence_family_consents` ADD CONSTRAINT `journal_evidence_family_consents_tenantId_shareId_fkey` FOREIGN KEY (`tenantId`, `shareId`) REFERENCES `journal_evidence_family_shares`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_evidence_family_consents` ADD CONSTRAINT `journal_evidence_family_consents_tenantId_membershipId_fkey` FOREIGN KEY (`tenantId`, `membershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
