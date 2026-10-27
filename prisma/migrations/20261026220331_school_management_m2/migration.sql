-- AlterTable
ALTER TABLE `classrooms` ADD COLUMN `capacity` INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN `unitId` VARCHAR(30) NULL;

-- CreateTable
CREATE TABLE `school_units` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `school_units_tenantId_active_name_idx`(`tenantId`, `active`, `name`),
    UNIQUE INDEX `school_units_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `school_units_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `classrooms_tenantId_unitId_schoolYear_idx` ON `classrooms`(`tenantId`, `unitId`, `schoolYear`);

-- AddForeignKey
ALTER TABLE `school_units` ADD CONSTRAINT `school_units_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `classrooms` ADD CONSTRAINT `classrooms_tenantId_unitId_fkey` FOREIGN KEY (`tenantId`, `unitId`) REFERENCES `school_units`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
