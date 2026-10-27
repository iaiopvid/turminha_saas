-- CreateTable
CREATE TABLE `imported_student_sources` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `studentId` VARCHAR(30) NOT NULL,
    `sourceKey` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `imported_student_sources_tenantId_studentId_idx`(`tenantId`, `studentId`),
    UNIQUE INDEX `imported_student_sources_tenantId_sourceKey_key`(`tenantId`, `sourceKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `school_years` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `year` INTEGER NOT NULL,
    `startsOn` DATE NOT NULL,
    `endsOn` DATE NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `school_years_tenantId_startsOn_endsOn_idx`(`tenantId`, `startsOn`, `endsOn`),
    UNIQUE INDEX `school_years_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `school_years_tenantId_year_key`(`tenantId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calendar_entries` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `schoolYearId` VARCHAR(30) NOT NULL,
    `createdByMembershipId` VARCHAR(30) NOT NULL,
    `kind` ENUM('TERM', 'HOLIDAY', 'RECESS', 'SCHOOL_EVENT') NOT NULL,
    `title` VARCHAR(140) NOT NULL,
    `startsOn` DATE NOT NULL,
    `endsOn` DATE NOT NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `calendar_entries_tenantId_schoolYearId_startsOn_endsOn_idx`(`tenantId`, `schoolYearId`, `startsOn`, `endsOn`),
    UNIQUE INDEX `calendar_entries_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invitations` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `createdByMembershipId` VARCHAR(30) NOT NULL,
    `studentId` VARCHAR(30) NULL,
    `classroomId` VARCHAR(30) NULL,
    `sourceKey` VARCHAR(140) NULL,
    `email` VARCHAR(254) NOT NULL,
    `displayName` VARCHAR(100) NOT NULL,
    `role` ENUM('SCHOOL_ADMIN', 'COORDINATOR', 'TEACHER', 'ASSISTANT', 'SECRETARY', 'BILLING_MANAGER', 'GUARDIAN') NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `invitations_tokenHash_key`(`tokenHash`),
    INDEX `invitations_tenantId_email_acceptedAt_revokedAt_expiresAt_idx`(`tenantId`, `email`, `acceptedAt`, `revokedAt`, `expiresAt`),
    UNIQUE INDEX `invitations_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `invitations_tenantId_sourceKey_key`(`tenantId`, `sourceKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_batches` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `createdByMembershipId` VARCHAR(30) NOT NULL,
    `sourceHash` CHAR(64) NOT NULL,
    `rowCount` INTEGER NOT NULL,
    `importedStudents` INTEGER NOT NULL,
    `createdInvitations` INTEGER NOT NULL,
    `rowErrors` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `import_batches_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    UNIQUE INDEX `import_batches_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `import_batches_tenantId_sourceHash_key`(`tenantId`, `sourceHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onboarding_progress` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `updatedByMembershipId` VARCHAR(30) NOT NULL,
    `step` VARCHAR(40) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `onboarding_progress_tenantId_completedAt_idx`(`tenantId`, `completedAt`),
    UNIQUE INDEX `onboarding_progress_tenantId_step_key`(`tenantId`, `step`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enrollment_transfers` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `studentId` VARCHAR(30) NOT NULL,
    `fromEnrollmentId` VARCHAR(30) NOT NULL,
    `toEnrollmentId` VARCHAR(30) NOT NULL,
    `recordedByMembershipId` VARCHAR(30) NOT NULL,
    `effectiveOn` DATE NOT NULL,
    `reason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `enrollment_transfers_tenantId_studentId_effectiveOn_idx`(`tenantId`, `studentId`, `effectiveOn`),
    UNIQUE INDEX `enrollment_transfers_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `enrollment_transfers_tenantId_fromEnrollmentId_key`(`tenantId`, `fromEnrollmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `imported_student_sources` ADD CONSTRAINT `imported_student_sources_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `imported_student_sources` ADD CONSTRAINT `imported_student_sources_tenantId_studentId_fkey` FOREIGN KEY (`tenantId`, `studentId`) REFERENCES `students`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `school_years` ADD CONSTRAINT `school_years_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calendar_entries` ADD CONSTRAINT `calendar_entries_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calendar_entries` ADD CONSTRAINT `calendar_entries_tenantId_schoolYearId_fkey` FOREIGN KEY (`tenantId`, `schoolYearId`) REFERENCES `school_years`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calendar_entries` ADD CONSTRAINT `calendar_entries_tenantId_createdByMembershipId_fkey` FOREIGN KEY (`tenantId`, `createdByMembershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_tenantId_createdByMembershipId_fkey` FOREIGN KEY (`tenantId`, `createdByMembershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_tenantId_studentId_fkey` FOREIGN KEY (`tenantId`, `studentId`) REFERENCES `students`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_tenantId_classroomId_fkey` FOREIGN KEY (`tenantId`, `classroomId`) REFERENCES `classrooms`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_batches` ADD CONSTRAINT `import_batches_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_batches` ADD CONSTRAINT `import_batches_tenantId_createdByMembershipId_fkey` FOREIGN KEY (`tenantId`, `createdByMembershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `onboarding_progress` ADD CONSTRAINT `onboarding_progress_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `onboarding_progress` ADD CONSTRAINT `onboarding_progress_tenantId_updatedByMembershipId_fkey` FOREIGN KEY (`tenantId`, `updatedByMembershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollment_transfers` ADD CONSTRAINT `enrollment_transfers_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollment_transfers` ADD CONSTRAINT `enrollment_transfers_tenantId_studentId_fkey` FOREIGN KEY (`tenantId`, `studentId`) REFERENCES `students`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollment_transfers` ADD CONSTRAINT `enrollment_transfers_tenantId_fromEnrollmentId_fkey` FOREIGN KEY (`tenantId`, `fromEnrollmentId`) REFERENCES `enrollments`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollment_transfers` ADD CONSTRAINT `enrollment_transfers_tenantId_toEnrollmentId_fkey` FOREIGN KEY (`tenantId`, `toEnrollmentId`) REFERENCES `enrollments`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollment_transfers` ADD CONSTRAINT `enrollment_transfers_tenantId_recordedByMembershipId_fkey` FOREIGN KEY (`tenantId`, `recordedByMembershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
