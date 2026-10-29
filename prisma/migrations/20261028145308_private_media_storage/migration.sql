-- AlterTable
ALTER TABLE `media_assets` ADD COLUMN `byteSize` INTEGER NULL,
    ADD COLUMN `checksumSha256` CHAR(64) NULL,
    ADD COLUMN `contentType` VARCHAR(100) NULL,
    ADD COLUMN `originalFilename` VARCHAR(255) NULL,
    ADD COLUMN `scanStatus` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `uploadedByMembershipId` VARCHAR(30) NULL;

-- CreateIndex
CREATE INDEX `media_assets_tenantId_classroomId_status_scanStatus_createdA_idx` ON `media_assets`(`tenantId`, `classroomId`, `status`, `scanStatus`, `createdAt`);

-- CreateIndex
CREATE INDEX `media_assets_tenantId_uploadedByMembershipId_createdAt_idx` ON `media_assets`(`tenantId`, `uploadedByMembershipId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_tenantId_uploadedByMembershipId_fkey` FOREIGN KEY (`tenantId`, `uploadedByMembershipId`) REFERENCES `memberships`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
