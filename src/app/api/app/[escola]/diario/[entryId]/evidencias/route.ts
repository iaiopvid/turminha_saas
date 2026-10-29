import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { EnrollmentStatus, MembershipRole, MembershipStatus } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";
import { putPrivateObject, storePrivateObjectLocally } from "@/server/storage/s3";
import { scanWithClamAv } from "@/server/storage/clamav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_FILE = 5 * 1024 * 1024;
const MAX_TOTAL = 10 * 1024 * 1024;
const roles = [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT];

function imageFormat(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function back(request: NextRequest, escola: string, entryId: string, state: string) {
  return NextResponse.redirect(new URL(`/app/${encodeURIComponent(escola)}/diario?entry=${encodeURIComponent(entryId)}&${state}=1`, request.url), 303);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string; entryId: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola, entryId } = await params;
  let context;
  try { context = await resolveTenantContext(escola, roles); }
  catch (error) { return new NextResponse("Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const contentLength = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) return new NextResponse("Content-Length obrigatório.", { status: 411 });
  if (contentLength > MAX_TOTAL + 256 * 1024) return new NextResponse("O limite por envio é 10 MB.", { status: 413 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) return new NextResponse("Envie imagens multipart.", { status: 415 });
  const form = await request.formData();
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length < 1 || files.length > 3 || files.some((file) => file.size > MAX_FILE) || files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL) return back(request, escola, entryId, "evidenceInvalid");

  const entry = await prisma.journalEntry.findFirst({
    where: {
      id: entryId, tenantId: context.tenantId,
      classroom: { status: EnrollmentStatus.ACTIVE, ...(context.role === MembershipRole.SCHOOL_ADMIN || context.role === MembershipRole.COORDINATOR ? {} : { staff: { some: { tenantId: context.tenantId, membershipId: context.membershipId } } }) },
    },
    select: { id: true, classroomId: true },
  });
  if (!entry) return new NextResponse("Registro não encontrado ou fora do seu escopo.", { status: 404 });

  const membership = await prisma.membership.findFirst({ where: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, status: MembershipStatus.ACTIVE, role: { in: roles } }, select: { id: true } });
  if (!membership) return new NextResponse("Acesso revogado.", { status: 403 });
  for (const upload of files) {
    const source = Buffer.from(await upload.arrayBuffer());
    const format = imageFormat(source);
    if (!format || source.length !== upload.size) return back(request, escola, entryId, "evidenceInvalid");
    let bytes: Buffer;
    try {
      const metadata = await sharp(source, { limitInputPixels: 25_000_000 }).metadata();
      if (metadata.format !== format || !metadata.width || !metadata.height || (metadata.pages !== undefined && metadata.pages > 1) || metadata.width * metadata.height > 25_000_000) return back(request, escola, entryId, "evidenceInvalid");
      bytes = await sharp(source, { limitInputPixels: 25_000_000 }).rotate().resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true }).webp({ quality: 80, effort: 3 }).toBuffer();
    } catch { return back(request, escola, entryId, "evidenceInvalid"); }
    if (!bytes.length || bytes.length > MAX_FILE) return back(request, escola, entryId, "evidenceInvalid");

    const id = randomBytes(18).toString("base64url");
    const expectedKey = `${context.tenantId}/${id}`;
    let storageKey = expectedKey;
    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    const originalFilename = (upload.name.replace(/\\/g, "/").split("/").pop() ?? "evidencia").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255) || "evidencia";
    await prisma.$transaction(async (tx) => {
      const activeMembership = await tx.membership.findFirst({ where: { id: membership.id, tenantId: context.tenantId, userId: context.userId, status: MembershipStatus.ACTIVE, role: { in: roles } }, select: { id: true } });
      const currentEntry = await tx.journalEntry.findFirst({ where: { id: entry.id, tenantId: context.tenantId, classroomId: entry.classroomId, classroom: { status: EnrollmentStatus.ACTIVE, ...(context.role === MembershipRole.SCHOOL_ADMIN || context.role === MembershipRole.COORDINATOR ? {} : { staff: { some: { tenantId: context.tenantId, membershipId: membership.id } } }) } }, select: { id: true } });
      if (!activeMembership || !currentEntry) throw new Error("SCOPE_REVOKED");
      await tx.journalEvidence.create({ data: { id, tenantId: context.tenantId, journalEntryId: entry.id, uploadedByMembershipId: activeMembership.id, storageKey: expectedKey, originalFilename, contentType: "image/webp", byteSize: bytes.length, checksumSha256, scanStatus: "PENDING", status: "QUARANTINED" } });
      await tx.journalEvidenceScanJob.create({ data: { tenantId: context.tenantId, journalEvidenceId: id, storageKey: expectedKey } });
    });
    try {
      storageKey = await putPrivateObject({ key: expectedKey, bytes, contentType: "image/webp", checksumSha256 });
      if (storageKey !== expectedKey) await prisma.$transaction(async (tx) => {
        await tx.journalEvidence.updateMany({ where: { tenantId: context.tenantId, id }, data: { storageKey } });
        await tx.journalEvidenceScanJob.updateMany({ where: { tenantId: context.tenantId, journalEvidenceId: id }, data: { storageKey } });
      });
    } catch {
      await prisma.$transaction(async (tx) => {
        await tx.journalEvidence.updateMany({ where: { tenantId: context.tenantId, id }, data: { status: "WITHDRAWN" } });
        await tx.journalEvidenceScanJob.updateMany({ where: { tenantId: context.tenantId, journalEvidenceId: id }, data: { status: "FAILED", processedAt: new Date(), lastError: "Private storage unavailable." } });
        await tx.storageOutbox.upsert({ where: { tenantId_idempotencyKey: { tenantId: context.tenantId, idempotencyKey: `journal-evidence-delete:${id}` } }, create: { tenantId: context.tenantId, idempotencyKey: `journal-evidence-delete:${id}`, storageKey }, update: {} });
      });
      return back(request, escola, entryId, "evidenceStorageError");
    }
    const scan = await scanWithClamAv(bytes);
    if (scan === "CLEAN") {
      await prisma.$transaction(async (tx) => {
        await tx.journalEvidence.updateMany({ where: { tenantId: context.tenantId, id, status: "QUARANTINED" }, data: { status: "PRIVATE", scanStatus: "CLEAN" } });
        await tx.journalEvidenceScanJob.updateMany({ where: { tenantId: context.tenantId, journalEvidenceId: id, status: "PENDING" }, data: { status: "DONE", processedAt: new Date(), lastError: null } });
      });
    } else if (scan === "INFECTED") {
      await prisma.$transaction(async (tx) => {
        await tx.journalEvidence.updateMany({ where: { tenantId: context.tenantId, id }, data: { status: "REJECTED", scanStatus: "INFECTED" } });
        await tx.journalEvidenceScanJob.updateMany({ where: { tenantId: context.tenantId, journalEvidenceId: id, status: "PENDING" }, data: { status: "DONE", processedAt: new Date(), lastError: null } });
        await tx.storageOutbox.upsert({ where: { tenantId_idempotencyKey: { tenantId: context.tenantId, idempotencyKey: `journal-evidence-delete:${id}` } }, create: { tenantId: context.tenantId, idempotencyKey: `journal-evidence-delete:${id}`, storageKey }, update: {} });
      });
    } else if (!storageKey.startsWith("local/")) {
      try {
        const previousKey = storageKey;
        storageKey = await storePrivateObjectLocally({ key: previousKey, bytes });
        await prisma.$transaction(async (tx) => {
          await tx.journalEvidence.updateMany({ where: { tenantId: context.tenantId, id, status: "QUARANTINED" }, data: { storageKey } });
          await tx.journalEvidenceScanJob.updateMany({ where: { tenantId: context.tenantId, journalEvidenceId: id, status: "PENDING" }, data: { storageKey } });
          await tx.storageOutbox.upsert({ where: { tenantId_idempotencyKey: { tenantId: context.tenantId, idempotencyKey: `journal-evidence-relocate:${id}` } }, create: { tenantId: context.tenantId, idempotencyKey: `journal-evidence-relocate:${id}`, storageKey: previousKey }, update: {} });
        });
      } catch { /* Keep the remote quarantined object and retry scanning later. */ }
    }
  }
  return back(request, escola, entryId, "evidenceUploaded");
}
