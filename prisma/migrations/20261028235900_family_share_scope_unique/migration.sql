ALTER TABLE `journal_evidence_family_shares`
  ADD UNIQUE INDEX `evidence_family_scope_uq` (`tenantId`, `journalEvidenceId`, `enrollmentId`);
