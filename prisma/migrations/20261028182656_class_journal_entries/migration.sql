-- CreateTable
CREATE TABLE `journal_entries` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `classroomId` VARCHAR(30) NOT NULL,
    `authorMembershipId` VARCHAR(30) NOT NULL,
    `happenedAt` DATE NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `description` TEXT NOT NULL,
    `materials` VARCHAR(1000) NULL,
    `status` ENUM('RECORDED') NOT NULL DEFAULT 'RECORDED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `journal_entries_tenantId_classroomId_happenedAt_createdAt_idx`(`tenantId`, `classroomId`, `happenedAt`, `createdAt`),
    INDEX `journal_entries_tenantId_authorMembershipId_happenedAt_idx`(`tenantId`, `authorMembershipId`, `happenedAt`),
    UNIQUE INDEX `journal_entries_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journal_participants` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `journalEntryId` VARCHAR(30) NOT NULL,
    `enrollmentId` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `journal_participants_tenantId_enrollmentId_createdAt_idx`(`tenantId`, `enrollmentId`, `createdAt`),
    UNIQUE INDEX `journal_participants_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `journal_participants_tenantId_journalEntryId_enrollmentId_key`(`tenantId`, `journalEntryId`, `enrollmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_tenantId_classroomId_fkey` FOREIGN KEY (`tenantId`, `classroomId`) REFERENCES `classrooms`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_tenantId_authorMembershipId_fkey` FOREIGN KEY (`tenantId`, `authorMembershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_participants` ADD CONSTRAINT `journal_participants_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_participants` ADD CONSTRAINT `journal_participants_tenantId_journalEntryId_fkey` FOREIGN KEY (`tenantId`, `journalEntryId`) REFERENCES `journal_entries`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_participants` ADD CONSTRAINT `journal_participants_tenantId_enrollmentId_fkey` FOREIGN KEY (`tenantId`, `enrollmentId`) REFERENCES `enrollments`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
