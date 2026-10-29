-- CreateTable
CREATE TABLE `rate_limit_buckets` (
    `keyHash` CHAR(64) NOT NULL,
    `windowStartedAt` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `rate_limit_buckets_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`keyHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
