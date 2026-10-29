CREATE TABLE `media_publications` (
  `id` VARCHAR(30) NOT NULL,
  `tenantId` VARCHAR(30) NOT NULL,
  `mediaAssetId` VARCHAR(30) NOT NULL,
  `studentId` VARCHAR(30) NOT NULL,
  `requestedByMembershipId` VARCHAR(30) NOT NULL,
  `status` ENUM('AWAITING_CONSENT','PUBLISHED','WITHDRAWN') NOT NULL DEFAULT 'AWAITING_CONSENT',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `publishedAt` DATETIME(3) NULL,
  `withdrawnAt` DATETIME(3) NULL,
  UNIQUE INDEX `media_publications_tenantId_id_key` (`tenantId`,`id`),
  INDEX `media_publications_tenantId_studentId_status_createdAt_idx` (`tenantId`,`studentId`,`status`,`createdAt`),
  INDEX `media_publications_tenantId_mediaAssetId_createdAt_idx` (`tenantId`,`mediaAssetId`,`createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `media_publications_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `media_publications_tenantId_mediaAssetId_fkey` FOREIGN KEY (`tenantId`,`mediaAssetId`) REFERENCES `media_assets` (`tenantId`,`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `media_publications_tenantId_studentId_fkey` FOREIGN KEY (`tenantId`,`studentId`) REFERENCES `students` (`tenantId`,`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `media_publications_tenantId_requestedByMembershipId_fkey` FOREIGN KEY (`tenantId`,`requestedByMembershipId`) REFERENCES `memberships` (`tenantId`,`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `media_publication_consents` (
  `id` VARCHAR(30) NOT NULL,
  `tenantId` VARCHAR(30) NOT NULL,
  `publicationId` VARCHAR(30) NOT NULL,
  `membershipId` VARCHAR(30) NOT NULL,
  `grantedAt` DATETIME(3) NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `media_publication_consents_tenantId_id_key` (`tenantId`,`id`),
  UNIQUE INDEX `media_pub_consent_scope_key` (`tenantId`,`publicationId`,`membershipId`),
  INDEX `media_publication_consents_tenantId_membershipId_revokedAt_idx` (`tenantId`,`membershipId`,`revokedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `media_publication_consents_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `media_publication_consents_tenantId_publicationId_fkey` FOREIGN KEY (`tenantId`,`publicationId`) REFERENCES `media_publications` (`tenantId`,`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `media_publication_consents_tenantId_membershipId_fkey` FOREIGN KEY (`tenantId`,`membershipId`) REFERENCES `memberships` (`tenantId`,`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `media_publication_events` (
  `id` VARCHAR(30) NOT NULL,
  `tenantId` VARCHAR(30) NOT NULL,
  `publicationId` VARCHAR(30) NOT NULL,
  `actorMembershipId` VARCHAR(30) NOT NULL,
  `consentId` VARCHAR(30) NULL,
  `action` VARCHAR(30) NOT NULL,
  `actorDisplayName` VARCHAR(100) NOT NULL,
  `actorRole` ENUM('SCHOOL_ADMIN','COORDINATOR','TEACHER','ASSISTANT','SECRETARY','BILLING_MANAGER','GUARDIAN') NOT NULL,
  `detail` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `media_publication_events_tenantId_id_key` (`tenantId`,`id`),
  INDEX `media_publication_events_tenantId_publicationId_createdAt_idx` (`tenantId`,`publicationId`,`createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `media_publication_events_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `media_publication_events_tenantId_publicationId_fkey` FOREIGN KEY (`tenantId`,`publicationId`) REFERENCES `media_publications` (`tenantId`,`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `media_publication_events_tenantId_actorMembershipId_fkey` FOREIGN KEY (`tenantId`,`actorMembershipId`) REFERENCES `memberships` (`tenantId`,`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `media_publication_events_tenantId_consentId_fkey` FOREIGN KEY (`tenantId`,`consentId`) REFERENCES `media_publication_consents` (`tenantId`,`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;
