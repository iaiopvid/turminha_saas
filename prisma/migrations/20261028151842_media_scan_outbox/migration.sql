-- CreateTable
CREATE TABLE `media_scan_jobs` (
    `id` VARCHAR(30) NOT NULL,
    `tenantId` VARCHAR(30) NOT NULL,
    `mediaAssetId` VARCHAR(30) NOT NULL,
    `storageKey` VARCHAR(300) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` VARCHAR(300) NULL,
    `lockedUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,

    INDEX `media_scan_jobs_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    UNIQUE INDEX `media_scan_jobs_tenantId_mediaAssetId_key`(`tenantId`, `mediaAssetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `media_scan_jobs` ADD CONSTRAINT `media_scan_jobs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_scan_jobs` ADD CONSTRAINT `media_scan_jobs_tenantId_mediaAssetId_fkey` FOREIGN KEY (`tenantId`, `mediaAssetId`) REFERENCES `media_assets`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
