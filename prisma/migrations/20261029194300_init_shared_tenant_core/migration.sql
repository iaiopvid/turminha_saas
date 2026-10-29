-- RedefineIndex
CREATE UNIQUE INDEX `journal_evidence_family_shares_tenantId_journalEvidenceId_en_key` ON `journal_evidence_family_shares`(`tenantId`, `journalEvidenceId`, `enrollmentId`);
DROP INDEX `evidence_family_scope_uq` ON `journal_evidence_family_shares`;

-- RedefineIndex
CREATE UNIQUE INDEX `media_publication_consents_tenantId_publicationId_membership_key` ON `media_publication_consents`(`tenantId`, `publicationId`, `membershipId`);
DROP INDEX `media_pub_consent_scope_key` ON `media_publication_consents`;
