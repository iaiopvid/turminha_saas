-- CreateTable
CREATE TABLE `learning_plans` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `classroomId` VARCHAR(30) NOT NULL,
    `authorMembershipId` VARCHAR(30) NOT NULL,
    `reviewerMembershipId` VARCHAR(30) NULL,
    `threadId` VARCHAR(30) NOT NULL,
    `supersedesId` VARCHAR(30) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `title` VARCHAR(160) NOT NULL,
    `ageGroup` VARCHAR(80) NOT NULL,
    `periodStart` DATE NOT NULL,
    `periodEnd` DATE NOT NULL,
    `durationMinutes` INTEGER NULL,
    `materials` VARCHAR(1000) NULL,
    `intentions` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `reviewComment` VARCHAR(1000) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `learning_plans_tenantId_classroomId_status_periodStart_idx`(`tenantId`, `classroomId`, `status`, `periodStart`),
    INDEX `learning_plans_tenantId_authorMembershipId_updatedAt_idx`(`tenantId`, `authorMembershipId`, `updatedAt`),
    INDEX `learning_plans_tenantId_threadId_version_idx`(`tenantId`, `threadId`, `version`),
    UNIQUE INDEX `learning_plans_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `learning_plans` ADD CONSTRAINT `learning_plans_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_plans` ADD CONSTRAINT `learning_plans_tenantId_classroomId_fkey` FOREIGN KEY (`tenantId`, `classroomId`) REFERENCES `classrooms`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_plans` ADD CONSTRAINT `learning_plans_tenantId_authorMembershipId_fkey` FOREIGN KEY (`tenantId`, `authorMembershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_plans` ADD CONSTRAINT `learning_plans_tenantId_reviewerMembershipId_fkey` FOREIGN KEY (`tenantId`, `reviewerMembershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_plans` ADD CONSTRAINT `learning_plans_tenantId_supersedesId_fkey` FOREIGN KEY (`tenantId`, `supersedesId`) REFERENCES `learning_plans`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
