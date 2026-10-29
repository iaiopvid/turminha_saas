import { prisma } from "../src/server/db/prisma";
import { deletePrivateObject, getPrivateObject, isTenantStorageKey, storePrivateObjectLocally } from "../src/server/storage/s3";
import { scanWithClamAv } from "../src/server/storage/clamav";

const now = new Date();
const evidenceOnlyIndex = process.argv.indexOf("--evidence-id");
const evidenceOnlyId = evidenceOnlyIndex >= 0 ? process.argv[evidenceOnlyIndex + 1] : undefined;
if (evidenceOnlyIndex >= 0 && !evidenceOnlyId) throw new Error("--evidence-id requires a journal evidence id.");
if (!evidenceOnlyId) {
  await prisma.storageOutbox.updateMany({ where: { status: "PROCESSING", lockedUntil: { lt: now } }, data: { status: "PENDING", lockedUntil: null, lastError: "Worker lease expired; safely retrying." } });
  await prisma.mediaScanJob.updateMany({ where: { status: "PROCESSING", lockedUntil: { lt: now } }, data: { status: "PENDING", lockedUntil: null, lastError: "Worker lease expired; safely retrying." } });
  await prisma.journalEvidenceScanJob.updateMany({ where: { status: "PROCESSING", lockedUntil: { lt: now } }, data: { status: "PENDING", lockedUntil: null, lastError: "Worker lease expired; safely retrying." } });
}
const batch = evidenceOnlyId ? [] : await prisma.storageOutbox.findMany({ where: { status: "PENDING" }, select: { id: true, tenantId: true, storageKey: true }, orderBy: { createdAt: "asc" }, take: 50 });
let done = 0;
let failed = 0;
const scanBatch = evidenceOnlyId ? [] : await prisma.mediaScanJob.findMany({ where: { status: "PENDING" }, select: { id: true, tenantId: true, mediaAssetId: true, storageKey: true }, orderBy: { createdAt: "asc" }, take: 50 });
const evidenceScanBatch = await prisma.journalEvidenceScanJob.findMany({ where: { status: "PENDING", ...(evidenceOnlyId ? { journalEvidenceId: evidenceOnlyId } : {}) }, select: { id: true, tenantId: true, journalEvidenceId: true, storageKey: true }, orderBy: { createdAt: "asc" }, take: evidenceOnlyId ? 1 : 50 });
let cleanScans = 0;
let infectedScans = 0;
let pendingScans = 0;
let cleanEvidenceScans = 0;
let infectedEvidenceScans = 0;
let pendingEvidenceScans = 0;
for (const job of scanBatch) {
  const claimed = await prisma.mediaScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: "PENDING" }, data: { status: "PROCESSING", lockedUntil: new Date(Date.now() + 60_000), attempts: { increment: 1 } } });
  if (!claimed.count) continue;
  const finish = (status: "DONE" | "FAILED", lastError: string | null) => prisma.mediaScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: "PROCESSING" }, data: { status, processedAt: new Date(), lockedUntil: null, lastError } });
  if (!isTenantStorageKey(job.storageKey, job.tenantId)) {
    await finish("FAILED", "Rejected scan key outside the tenant storage prefix.");
    failed += 1;
    continue;
  }
  const asset = await prisma.mediaAsset.findFirst({ where: { tenantId: job.tenantId, id: job.mediaAssetId, storageKey: job.storageKey }, select: { id: true, status: true, scanStatus: true, studentId: true } });
  if (!asset || asset.status !== "QUARANTINED" || asset.scanStatus !== "PENDING") {
    await finish(asset ? "DONE" : "FAILED", asset ? "Scan no longer needed after media state changed." : "Media row not found for tenant-scoped scan.");
    continue;
  }
  try {
    const object = await getPrivateObject(job.storageKey);
    const result = await scanWithClamAv(Buffer.from(object.bytes));
    if (result === "UNAVAILABLE") {
      const localKey = job.storageKey.startsWith("local/") ? job.storageKey : await storePrivateObjectLocally({ key: job.storageKey, bytes: Buffer.from(object.bytes) });
      await prisma.$transaction(async (tx) => {
        if (localKey !== job.storageKey) {
          await tx.mediaAsset.updateMany({ where: { tenantId: job.tenantId, id: asset.id, status: "QUARANTINED", scanStatus: "PENDING" }, data: { storageKey: localKey } });
          await tx.mediaScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: "PROCESSING" }, data: { storageKey: localKey } });
          await tx.storageOutbox.upsert({ where: { tenantId_idempotencyKey: { tenantId: job.tenantId, idempotencyKey: `media-relocate:${asset.id}` } }, create: { tenantId: job.tenantId, idempotencyKey: `media-relocate:${asset.id}`, storageKey: job.storageKey }, update: {} });
        }
        await tx.mediaScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: "PROCESSING" }, data: { status: "PENDING", lockedUntil: null, lastError: "ClamAV unavailable; retained locally and rescan scheduled." } });
      });
      pendingScans += 1;
      continue;
    }
    if (result === "CLEAN") {
      await prisma.$transaction(async (tx) => {
        await tx.mediaAsset.updateMany({ where: { tenantId: job.tenantId, id: asset.id, status: "QUARANTINED", scanStatus: "PENDING" }, data: { status: asset.studentId ? "PRIVATE" : "PENDING", scanStatus: "CLEAN" } });
        await tx.mediaScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: "PROCESSING" }, data: { status: "DONE", processedAt: new Date(), lockedUntil: null, lastError: null } });
      });
      cleanScans += 1;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.mediaAsset.updateMany({ where: { tenantId: job.tenantId, id: asset.id, status: "QUARANTINED", scanStatus: "PENDING" }, data: { status: "REJECTED", scanStatus: "INFECTED" } });
      await tx.mediaSubmission.updateMany({ where: { tenantId: job.tenantId, mediaAssetId: asset.id, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } }, data: { status: "WITHDRAWN", reviewedAt: new Date(), reviewComment: "Conteúdo bloqueado na verificação de segurança." } });
      await tx.storageOutbox.upsert({ where: { tenantId_idempotencyKey: { tenantId: job.tenantId, idempotencyKey: `media-delete:${asset.id}` } }, create: { tenantId: job.tenantId, idempotencyKey: `media-delete:${asset.id}`, storageKey: job.storageKey }, update: {} });
      await tx.mediaScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: "PROCESSING" }, data: { status: "DONE", processedAt: new Date(), lockedUntil: null, lastError: null } });
    });
    infectedScans += 1;
  } catch {
    await prisma.mediaScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: "PROCESSING" }, data: { status: "PENDING", lockedUntil: null, lastError: "Private object scan failed; retry scheduled." } });
    pendingScans += 1;
  }
}
for (const job of evidenceScanBatch) {
  const claimed = await prisma.journalEvidenceScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: "PENDING" }, data: { status: "PROCESSING", lockedUntil: new Date(Date.now() + 60_000), attempts: { increment: 1 } } });
  if (!claimed.count) continue;
  const finish = (status: "DONE" | "FAILED", lastError: string | null) => prisma.journalEvidenceScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: "PROCESSING" }, data: { status, processedAt: new Date(), lockedUntil: null, lastError } });
  if (!isTenantStorageKey(job.storageKey, job.tenantId)) {
    await finish("FAILED", "Rejected journal evidence key outside the tenant storage prefix.");
    failed += 1;
    continue;
  }
  const evidence = await prisma.journalEvidence.findFirst({ where: { tenantId: job.tenantId, id: job.journalEvidenceId, storageKey: job.storageKey }, select: { id: true, status: true, scanStatus: true } });
  if (!evidence || evidence.status !== "QUARANTINED" || evidence.scanStatus !== "PENDING") {
    await finish(evidence ? "DONE" : "FAILED", evidence ? "Evidence scan no longer needed after state change." : "Evidence row not found for tenant-scoped scan.");
    continue;
  }
  try {
    const object = await getPrivateObject(job.storageKey);
    const result = await scanWithClamAv(Buffer.from(object.bytes));
    if (result === "UNAVAILABLE") {
      const localKey = job.storageKey.startsWith("local/") ? job.storageKey : await storePrivateObjectLocally({ key: job.storageKey, bytes: Buffer.from(object.bytes) });
      await prisma.$transaction(async (tx) => {
        if (localKey !== job.storageKey) {
          await tx.journalEvidence.updateMany({ where: { tenantId: job.tenantId, id: evidence.id, status: "QUARANTINED", scanStatus: "PENDING" }, data: { storageKey: localKey } });
          await tx.journalEvidenceScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: "PROCESSING" }, data: { storageKey: localKey } });
          await tx.storageOutbox.upsert({ where: { tenantId_idempotencyKey: { tenantId: job.tenantId, idempotencyKey: `journal-evidence-relocate:${evidence.id}` } }, create: { tenantId: job.tenantId, idempotencyKey: `journal-evidence-relocate:${evidence.id}`, storageKey: job.storageKey }, update: {} });
        }
        await tx.journalEvidenceScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: "PROCESSING" }, data: { status: "PENDING", lockedUntil: null, lastError: "ClamAV unavailable; retained locally and rescan scheduled." } });
      });
      pendingEvidenceScans += 1;
      continue;
    }
    if (result === "CLEAN") {
      await prisma.$transaction(async (tx) => {
        await tx.journalEvidence.updateMany({ where: { tenantId: job.tenantId, id: evidence.id, status: "QUARANTINED", scanStatus: "PENDING" }, data: { status: "PRIVATE", scanStatus: "CLEAN" } });
        await tx.journalEvidenceScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: "PROCESSING" }, data: { status: "DONE", processedAt: new Date(), lockedUntil: null, lastError: null } });
      });
      cleanEvidenceScans += 1;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.journalEvidence.updateMany({ where: { tenantId: job.tenantId, id: evidence.id, status: "QUARANTINED", scanStatus: "PENDING" }, data: { status: "REJECTED", scanStatus: "INFECTED" } });
      await tx.storageOutbox.upsert({ where: { tenantId_idempotencyKey: { tenantId: job.tenantId, idempotencyKey: `journal-evidence-delete:${evidence.id}` } }, create: { tenantId: job.tenantId, idempotencyKey: `journal-evidence-delete:${evidence.id}`, storageKey: job.storageKey }, update: {} });
      await tx.journalEvidenceScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: "PROCESSING" }, data: { status: "DONE", processedAt: new Date(), lockedUntil: null, lastError: null } });
    });
    infectedEvidenceScans += 1;
  } catch {
    await prisma.journalEvidenceScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: "PROCESSING" }, data: { status: "PENDING", lockedUntil: null, lastError: "Private evidence scan failed; retry scheduled." } });
    pendingEvidenceScans += 1;
  }
}
for (const item of batch) {
  const claimed = await prisma.storageOutbox.updateMany({ where: { id: item.id, tenantId: item.tenantId, status: "PENDING" }, data: { status: "PROCESSING", lockedUntil: new Date(Date.now() + 60_000), attempts: { increment: 1 } } });
  if (!claimed.count) continue;
  if (!isTenantStorageKey(item.storageKey, item.tenantId)) {
    await prisma.storageOutbox.updateMany({ where: { id: item.id, tenantId: item.tenantId, status: "PROCESSING" }, data: { status: "FAILED", processedAt: new Date(), lockedUntil: null, lastError: "Rejected outbox key outside the tenant storage prefix." } });
    failed += 1;
    continue;
  }
  try {
    await deletePrivateObject(item.storageKey);
    await prisma.storageOutbox.updateMany({ where: { id: item.id, tenantId: item.tenantId, status: "PROCESSING" }, data: { status: "DONE", processedAt: new Date(), lockedUntil: null, lastError: null } });
    done += 1;
  } catch {
    await prisma.storageOutbox.updateMany({ where: { id: item.id, tenantId: item.tenantId, status: "PROCESSING" }, data: { status: "PENDING", lockedUntil: null, lastError: "Private object deletion failed; retry scheduled." } });
    failed += 1;
  }
}
console.log(JSON.stringify({ deleteEventsScanned: batch.length, deleted: done, scanJobsScanned: scanBatch.length, cleanScans, infectedScans, retryableScanFailures: pendingScans, evidenceScanJobsScanned: evidenceScanBatch.length, cleanEvidenceScans, infectedEvidenceScans, retryableEvidenceScans: pendingEvidenceScans, terminalFailures: failed }));
await prisma.$disconnect();
