-- CreateTable
CREATE TABLE `tenants` (
    `id` VARCHAR(30) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `tenants_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schools` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `name` VARCHAR(140) NOT NULL,
    `displayClass` VARCHAR(100) NOT NULL DEFAULT 'Nossa turma',
    `displayTeam` VARCHAR(180) NOT NULL DEFAULT 'Equipe pedagógica',
    `timezone` VARCHAR(80) NOT NULL DEFAULT 'America/Sao_Paulo',
    `publicStudents` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `schools_tenantId_key`(`tenantId`),
    UNIQUE INDEX `schools_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(30) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `displayName` VARCHAR(100) NOT NULL,
    `passwordHash` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(30) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `userId` VARCHAR(30) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sessions_tokenHash_key`(`tokenHash`),
    INDEX `sessions_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `memberships` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `userId` VARCHAR(30) NOT NULL,
    `role` ENUM('SCHOOL_ADMIN', 'COORDINATOR', 'TEACHER', 'ASSISTANT', 'SECRETARY', 'BILLING_MANAGER', 'GUARDIAN') NOT NULL,
    `status` ENUM('ACTIVE', 'INVITED', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `memberships_userId_status_idx`(`userId`, `status`),
    UNIQUE INDEX `memberships_tenantId_userId_key`(`tenantId`, `userId`),
    UNIQUE INDEX `memberships_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `classrooms` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `schoolYear` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'WAITLISTED', 'TRANSFERRED', 'FINISHED') NOT NULL DEFAULT 'ACTIVE',

    INDEX `classrooms_tenantId_schoolYear_status_idx`(`tenantId`, `schoolYear`, `status`),
    UNIQUE INDEX `classrooms_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `classrooms_tenantId_schoolYear_name_key`(`tenantId`, `schoolYear`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `classroom_staff` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `classroomId` VARCHAR(30) NOT NULL,
    `membershipId` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `classroom_staff_tenantId_membershipId_idx`(`tenantId`, `membershipId`),
    UNIQUE INDEX `classroom_staff_tenantId_classroomId_membershipId_key`(`tenantId`, `classroomId`, `membershipId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `students` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `displayName` VARCHAR(100) NOT NULL,
    `publicProfile` BOOLEAN NOT NULL DEFAULT false,
    `publicQuote` VARCHAR(240) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `students_tenantId_displayName_idx`(`tenantId`, `displayName`),
    UNIQUE INDEX `students_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enrollments` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `studentId` VARCHAR(30) NOT NULL,
    `classroomId` VARCHAR(30) NOT NULL,
    `status` ENUM('ACTIVE', 'WAITLISTED', 'TRANSFERRED', 'FINISHED') NOT NULL DEFAULT 'ACTIVE',
    `validFrom` DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `validUntil` DATE NULL,

    INDEX `enrollments_tenantId_classroomId_status_idx`(`tenantId`, `classroomId`, `status`),
    UNIQUE INDEX `enrollments_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `enrollments_tenantId_studentId_classroomId_key`(`tenantId`, `studentId`, `classroomId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_guardians` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `studentId` VARCHAR(30) NOT NULL,
    `membershipId` VARCHAR(30) NOT NULL,
    `approved` BOOLEAN NOT NULL DEFAULT false,
    `revokedAt` DATETIME(3) NULL,

    INDEX `student_guardians_tenantId_membershipId_approved_revokedAt_idx`(`tenantId`, `membershipId`, `approved`, `revokedAt`),
    UNIQUE INDEX `student_guardians_tenantId_studentId_membershipId_key`(`tenantId`, `studentId`, `membershipId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `enrollmentId` VARCHAR(30) NOT NULL,
    `classDate` DATE NOT NULL,
    `status` ENUM('PRESENT', 'ABSENT', 'LATE', 'EXCUSED') NOT NULL,
    `recordedBy` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `attendance_tenantId_classDate_status_idx`(`tenantId`, `classDate`, `status`),
    INDEX `attendance_tenantId_recordedBy_idx`(`tenantId`, `recordedBy`),
    UNIQUE INDEX `attendance_tenantId_enrollmentId_classDate_key`(`tenantId`, `enrollmentId`, `classDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcements` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `classroomId` VARCHAR(30) NULL,
    `title` VARCHAR(160) NOT NULL,
    `body` VARCHAR(2000) NOT NULL,
    `visibility` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `announcements_tenantId_visibility_publishedAt_idx`(`tenantId`, `visibility`, `publishedAt`),
    UNIQUE INDEX `announcements_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media_assets` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `classroomId` VARCHAR(30) NULL,
    `title` VARCHAR(160) NOT NULL,
    `category` ENUM('ACTIVITY', 'PLAY', 'EVENT') NOT NULL,
    `storageKey` VARCHAR(300) NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `media_assets_tenantId_classroomId_publishedAt_id_idx`(`tenantId`, `classroomId`, `publishedAt`, `id`),
    UNIQUE INDEX `media_assets_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `schools` ADD CONSTRAINT `schools_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `classrooms` ADD CONSTRAINT `classrooms_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `classroom_staff` ADD CONSTRAINT `classroom_staff_tenantId_classroomId_fkey` FOREIGN KEY (`tenantId`, `classroomId`) REFERENCES `classrooms`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `classroom_staff` ADD CONSTRAINT `classroom_staff_tenantId_membershipId_fkey` FOREIGN KEY (`tenantId`, `membershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `students_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_tenantId_studentId_fkey` FOREIGN KEY (`tenantId`, `studentId`) REFERENCES `students`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_tenantId_classroomId_fkey` FOREIGN KEY (`tenantId`, `classroomId`) REFERENCES `classrooms`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_guardians` ADD CONSTRAINT `student_guardians_tenantId_studentId_fkey` FOREIGN KEY (`tenantId`, `studentId`) REFERENCES `students`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_guardians` ADD CONSTRAINT `student_guardians_tenantId_membershipId_fkey` FOREIGN KEY (`tenantId`, `membershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_tenantId_enrollmentId_fkey` FOREIGN KEY (`tenantId`, `enrollmentId`) REFERENCES `enrollments`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_tenantId_recordedBy_fkey` FOREIGN KEY (`tenantId`, `recordedBy`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_tenantId_classroomId_fkey` FOREIGN KEY (`tenantId`, `classroomId`) REFERENCES `classrooms`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_tenantId_classroomId_fkey` FOREIGN KEY (`tenantId`, `classroomId`) REFERENCES `classrooms`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
