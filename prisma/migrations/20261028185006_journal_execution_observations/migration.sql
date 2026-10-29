-- AlterTable
ALTER TABLE `journal_entries` ADD COLUMN `learningPlanId` VARCHAR(30) NULL;

-- AlterTable
ALTER TABLE `journal_participants` ADD COLUMN `observation` VARCHAR(1000) NULL;

-- CreateIndex
CREATE INDEX `journal_entries_tenantId_learningPlanId_idx` ON `journal_entries`(`tenantId`, `learningPlanId`);

-- AddForeignKey
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_tenantId_learningPlanId_fkey` FOREIGN KEY (`tenantId`, `learningPlanId`) REFERENCES `learning_plans`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
