-- Enforce that a journal entry can reference a plan from the same tenant and classroom.
ALTER TABLE `journal_entries`
  DROP FOREIGN KEY `journal_entries_tenantId_learningPlanId_fkey`;

CREATE UNIQUE INDEX `learning_plans_tenantId_classroomId_id_key`
  ON `learning_plans`(`tenantId`, `classroomId`, `id`);

ALTER TABLE `journal_entries`
  ADD CONSTRAINT `journal_entries_tenantId_classroomId_learningPlanId_fkey`
  FOREIGN KEY (`tenantId`, `classroomId`, `learningPlanId`)
  REFERENCES `learning_plans`(`tenantId`, `classroomId`, `id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
