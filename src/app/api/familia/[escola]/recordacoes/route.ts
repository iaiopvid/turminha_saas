import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";
import { isPrivateStorageConfigured, putPrivateObject, storePrivateObjectLocally } from "@/server/storage/s3";
import { scanWithClamAv } from "@/server/storage/clamav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LIMIT = 5 * 1024 * 1024;
const formSchema = z.object({ studentId: z.string().min(1).max(30), priorSubmissionId: z.string().max(30).optional(), title: z.string().trim().min(2).max(160), category: z.enum(["ACTIVITY", "PLAY", "EVENT"]), submitToSchool: z.enum(["true", "false"]), privateConsent: z.literal("yes"), schoolConsent: z.enum(["yes", "no"]) });

function sourceFormat(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function back(request: NextRequest, escola: string, result: string) {
  return NextResponse.redirect(new URL(`/familia/${encodeURIComponent(escola)}?memory=${result}`, request.url), 303);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.GUARDIAN]); }
  catch (error) { return new NextResponse("Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const length = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(length) || length < 1) return new NextResponse("Content-Length obrigatório.", { status: 411 });
  if (length > LIMIT + 128 * 1024) return new NextResponse("Arquivo excede 5 MB.", { status: 413 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) return new NextResponse("Envie uma imagem multipart.", { status: 415 });
  const form = await request.formData();
  const parsed = formSchema.safeParse({ studentId: form.get("studentId"), priorSubmissionId: form.get("priorSubmissionId") || undefined, title: form.get("title"), category: form.get("category"), submitToSchool: form.get("submitToSchool") ?? "false", privateConsent: form.get("privateConsent"), schoolConsent: form.get("schoolConsent") ?? "no" });
  const upload = form.get("file");
  if (!parsed.success || !(upload instanceof File) || upload.size < 1 || upload.size > LIMIT) return back(request, escola, "invalid");
  if ((parsed.data.submitToSchool === "true") !== (parsed.data.schoolConsent === "yes")) return back(request, escola, "consent");
  const link = await prisma.studentGuardian.findFirst({ where: { tenantId: context.tenantId, studentId: parsed.data.studentId, membershipId: context.membershipId, approved: true, revokedAt: null, membership: { status: "ACTIVE", role: MembershipRole.GUARDIAN } }, select: { studentId: true } });
  if (!link) return new NextResponse("Criança fora do vínculo familiar ativo.", { status: 403 });
  const previous = parsed.data.priorSubmissionId ? await prisma.mediaSubmission.findFirst({ where: { id: parsed.data.priorSubmissionId, tenantId: context.tenantId, studentId: link.studentId, submittedByMembershipId: context.membershipId, status: "CHANGES_REQUESTED", submittedBy: { guardianLinks: { some: { tenantId: context.tenantId, studentId: link.studentId, approved: true, revokedAt: null } } }, mediaAsset: { status: "PRIVATE", AND: [{ consents: { some: { tenantId: context.tenantId, membershipId: context.membershipId, purpose: "PRIVATE_STORAGE", revokedAt: null } } }, { consents: { some: { tenantId: context.tenantId, membershipId: context.membershipId, purpose: "SCHOOL_REVIEW", revokedAt: null } } }] } }, select: { id: true, version: true, threadId: true } }) : null;
  if (parsed.data.priorSubmissionId && (!previous || parsed.data.submitToSchool !== "true" || parsed.data.schoolConsent !== "yes")) return new NextResponse("Reenvio fora do seu escopo ou sem novo consentimento de revisão.", { status: 403 });
  if (!isPrivateStorageConfigured()) return back(request, escola, "storage");

  const source = Buffer.from(await upload.arrayBuffer());
  const format = sourceFormat(source);
  if (!format || source.length !== upload.size) return back(request, escola, "invalid");
  let bytes: Buffer;
  try {
    const meta = await sharp(source, { limitInputPixels: 25_000_000 }).metadata();
    if (meta.format !== format || !meta.width || !meta.height || meta.width * meta.height > 25_000_000 || (meta.pages ?? 1) > 1) return back(request, escola, "invalid");
    bytes = await sharp(source, { limitInputPixels: 25_000_000 }).rotate().resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true }).webp({ quality: 80, effort: 3 }).toBuffer();
  } catch { return back(request, escola, "invalid"); }
  if (!bytes.length || bytes.length > LIMIT) return back(request, escola, "invalid");

  const id = randomBytes(18).toString("base64url");
  const key = `${context.tenantId}/${id}`;
  let storedKey = key;
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const filename = (upload.name.replace(/\\/g, "/").split("/").pop() ?? "recordacao").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "recordacao";
  await prisma.$transaction(async (tx) => {
    await tx.mediaAsset.create({ data: { id, tenantId: context.tenantId, studentId: link.studentId, uploadedByMembershipId: context.membershipId, title: parsed.data.title, category: parsed.data.category, storageKey: key, originalFilename: filename, contentType: "image/webp", byteSize: bytes.length, checksumSha256: checksum, status: "QUARANTINED", scanStatus: "PENDING" } });
    await tx.mediaScanJob.create({ data: { tenantId: context.tenantId, mediaAssetId: id, storageKey: key } });
    await tx.mediaConsent.create({ data: { tenantId: context.tenantId, mediaAssetId: id, membershipId: context.membershipId, purpose: "PRIVATE_STORAGE" } });
    if (parsed.data.submitToSchool === "true") {
      await tx.mediaConsent.create({ data: { tenantId: context.tenantId, mediaAssetId: id, membershipId: context.membershipId, purpose: "SCHOOL_REVIEW" } });
      const submissionId = randomBytes(18).toString("base64url");
      if (previous) await tx.mediaSubmission.updateMany({ where: { tenantId: context.tenantId, id: previous.id, status: "CHANGES_REQUESTED" }, data: { threadId: previous.threadId ?? previous.id } });
      const submission = await tx.mediaSubmission.create({ data: { id: submissionId, threadId: previous?.threadId ?? previous?.id ?? submissionId, tenantId: context.tenantId, mediaAssetId: id, studentId: link.studentId, submittedByMembershipId: context.membershipId, status: "SUBMITTED", version: previous ? previous.version + 1 : 1, supersedesId: previous?.id }, select: { id: true } });
      await tx.mediaReviewEvent.create({ data: { tenantId: context.tenantId, submissionId: submission.id, actorMembershipId: context.membershipId, actorDisplayName: context.displayName, actorRole: MembershipRole.GUARDIAN, fromStatus: null, toStatus: "SUBMITTED", comment: previous ? `Reenvio da versão ${previous.version}.` : null } });
    }
  });
  try {
    storedKey = await putPrivateObject({ key, bytes, contentType: "image/webp", checksumSha256: checksum });
    if (storedKey !== key) await prisma.$transaction(async (tx) => {
      await tx.mediaAsset.updateMany({ where: { tenantId: context.tenantId, id }, data: { storageKey: storedKey } });
      await tx.mediaScanJob.updateMany({ where: { tenantId: context.tenantId, mediaAssetId: id }, data: { storageKey: storedKey } });
    });
  }
  catch {
    await prisma.$transaction(async (tx) => {
      await tx.mediaAsset.updateMany({ where: { tenantId: context.tenantId, id }, data: { status: "WITHDRAWN" } });
      await tx.mediaSubmission.updateMany({ where: { tenantId: context.tenantId, mediaAssetId: id, status: "SUBMITTED" }, data: { status: "WITHDRAWN" } });
      await tx.mediaScanJob.updateMany({ where: { tenantId: context.tenantId, mediaAssetId: id, status: "PENDING" }, data: { status: "FAILED", processedAt: new Date(), lastError: "Storage upload failed." } });
      await tx.storageOutbox.upsert({ where: { tenantId_idempotencyKey: { tenantId: context.tenantId, idempotencyKey: `media-delete:${id}` } }, create: { tenantId: context.tenantId, idempotencyKey: `media-delete:${id}`, storageKey: storedKey }, update: {} });
    });
    return back(request, escola, "storage");
  }
  const scan = await scanWithClamAv(bytes);
  if (scan === "CLEAN") {
    await prisma.mediaAsset.updateMany({ where: { tenantId: context.tenantId, id, status: "QUARANTINED" }, data: { status: "PRIVATE", scanStatus: "CLEAN" } });
    await prisma.mediaScanJob.updateMany({ where: { tenantId: context.tenantId, mediaAssetId: id, status: "PENDING" }, data: { status: "DONE", processedAt: new Date(), lastError: null } });
    return back(request, escola, parsed.data.submitToSchool === "true" ? "submitted" : "saved");
  }
  if (scan === "INFECTED") {
    await prisma.$transaction(async (tx) => {
      await tx.mediaAsset.updateMany({ where: { tenantId: context.tenantId, id }, data: { status: "REJECTED", scanStatus: "INFECTED" } });
      await tx.mediaScanJob.updateMany({ where: { tenantId: context.tenantId, mediaAssetId: id, status: "PENDING" }, data: { status: "DONE", processedAt: new Date(), lastError: null } });
      await tx.mediaSubmission.updateMany({ where: { tenantId: context.tenantId, mediaAssetId: id, status: "SUBMITTED" }, data: { status: "WITHDRAWN" } });
      await tx.storageOutbox.upsert({ where: { tenantId_idempotencyKey: { tenantId: context.tenantId, idempotencyKey: `media-delete:${id}` } }, create: { tenantId: context.tenantId, idempotencyKey: `media-delete:${id}`, storageKey: storedKey }, update: {} });
    });
    return back(request, escola, "infected");
  }
  if (!storedKey.startsWith("local/")) {
    try {
      const remoteKey = storedKey;
      storedKey = await storePrivateObjectLocally({ key: remoteKey, bytes });
      await prisma.$transaction(async (tx) => {
        await tx.mediaAsset.updateMany({ where: { tenantId: context.tenantId, id, status: "QUARANTINED" }, data: { storageKey: storedKey } });
        await tx.mediaScanJob.updateMany({ where: { tenantId: context.tenantId, mediaAssetId: id, status: "PENDING" }, data: { storageKey: storedKey } });
        await tx.storageOutbox.upsert({ where: { tenantId_idempotencyKey: { tenantId: context.tenantId, idempotencyKey: `media-relocate:${id}` } }, create: { tenantId: context.tenantId, idempotencyKey: `media-relocate:${id}`, storageKey: remoteKey }, update: {} });
      });
    } catch { /* Keep the remote quarantined object and retry scanning later. */ }
  }
  return back(request, escola, "scan-pending");
}
