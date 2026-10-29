CREATE TABLE `tenant_domains` (
  `id` VARCHAR(30) NOT NULL,
  `tenantId` VARCHAR(30) NOT NULL,
  `hostname` VARCHAR(253) NOT NULL,
  `verificationToken` VARCHAR(64) NOT NULL,
  `status` ENUM('PENDING', 'VERIFIED') NOT NULL DEFAULT 'PENDING',
  `verifiedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `tenant_domains_hostname_key` (`hostname`),
  UNIQUE INDEX `tenant_domains_verificationToken_key` (`verificationToken`),
  UNIQUE INDEX `tenant_domains_tenantId_id_key` (`tenantId`, `id`),
  INDEX `tenant_domains_tenantId_status_idx` (`tenantId`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `tenant_domains_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;
