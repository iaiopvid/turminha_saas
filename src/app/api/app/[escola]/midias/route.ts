import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { MembershipRole } from "@/generated/prisma/client";
import { z } from "zod";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";
import { deletePrivateObject, isPrivateStorageConfigured, putPrivateObject, storePrivateObjectLocally } from "@/server/storage/s3";
import { scanWithClamAv } from "@/server/storage/clamav";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD = 128 * 1024;
const roles = [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT];
const schema = z.object({
  classroomId: z.string().min(1).max(30),
  title: z.string().trim().min(2).max(160),
  category: z.enum(["ACTIVITY", "PLAY", "EVENT"]),
});

function redirectTo(request: NextRequest, escola: string, result: string) {
  return NextResponse.redirect(new URL(`/app/${encodeURIComponent(escola)}/midias?${result}=1`, request.url), 303);
}

function imageFormat(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, roles); }
  catch (error) { return new NextResponse(error instanceof ContextError ? "Acesso negado." : "Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }

  const contentLength = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) return new NextResponse("Content-Length obrigatório.", { status: 411 });
  if (contentLength > MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD) return new NextResponse("Upload excede o limite de 5 MB.", { status: 413 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) return new NextResponse("Envie uma imagem multipart.", { status: 415 });
  const form = await request.formData();
  const parsed = schema.safeParse({ classroomId: form.get("classroomId"), title: form.get("title"), category: form.get("category") });
  const upload = form.get("file");
  if (!parsed.success || !(upload instanceof File)) return redirectTo(request, escola, "invalid=1");
  if (upload.size < 1 || upload.size > MAX_UPLOAD_BYTES) return redirectTo(request, escola, "invalid=1");

  const classroom = await prisma.classroom.findFirst({
    where: {
      id: parsed.data.classroomId,
      tenantId: context.tenantId,
      status: "ACTIVE",
      ...(context.role === MembershipRole.TEACHER || context.role === MembershipRole.ASSISTANT
        ? { staff: { some: { tenantId: context.tenantId, membershipId: context.membershipId } } }
        : {}),
    },
    select: { id: true },
  });
  if (!classroom) return new NextResponse("Turma não encontrada ou fora do seu escopo.", { status: 403 });

  const source = Buffer.from(await upload.arrayBuffer());
  const sourceFormat = imageFormat(source);
  if (!sourceFormat || source.length !== upload.size) return redirectTo(request, escola, "invalid=1");
  let bytes: Buffer;
  try {
    const metadata = await sharp(source, { limitInputPixels: 25_000_000 }).metadata();
    if (metadata.format !== sourceFormat || !metadata.width || !metadata.height || (metadata.pages !== undefined && metadata.pages > 1) || metadata.width * metadata.height > 25_000_000) return redirectTo(request, escola, "invalid=1");
    // Re-encode an oriented derivative; Sharp strips source metadata by default.
    bytes = await sharp(source, { limitInputPixels: 25_000_000 })
      .rotate()
      .resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80, effort: 3 })
      .toBuffer();
  } catch {
    return redirectTo(request, escola, "invalid=1");
  }
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) return redirectTo(request, escola, "invalid=1");
  if (!isPrivateStorageConfigured()) return redirectTo(request, escola, "error=storage");

  const id = randomBytes(18).toString("base64url");
  const storageKey = `${context.tenantId}/${id}`;
  let storedKey = storageKey;
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  const originalFilename = (upload.name.replace(/\\/g, "/").split("/").pop() ?? "upload")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255) || "upload.webp";

  await prisma.$transaction(async (tx) => {
    await tx.mediaAsset.create({ data: {
    id,
    tenantId: context.tenantId,
    classroomId: classroom.id,
    uploadedByMembershipId: context.membershipId,
    title: parsed.data.title,
    category: parsed.data.category,
    storageKey,
    originalFilename,
    contentType: "image/webp",
    byteSize: bytes.length,
    checksumSha256,
    status: "QUARANTINED",
    scanStatus: "PENDING",
    } });
    await tx.mediaScanJob.create({ data: { tenantId: context.tenantId, mediaAssetId: id, storageKey } });
  });

  try {
    storedKey = await putPrivateObject({ key: storageKey, bytes, contentType: "image/webp", checksumSha256 });
    if (storedKey !== storageKey) {
      await prisma.$transaction(async (tx) => {
        await tx.mediaAsset.updateMany({ where: { tenantId: context.tenantId, id }, data: { storageKey: storedKey } });
        await tx.mediaScanJob.updateMany({ where: { tenantId: context.tenantId, mediaAssetId: id }, data: { storageKey: storedKey } });
      });
    }
  } catch {
    await prisma.$transaction(async (tx) => {
      await tx.mediaAsset.updateMany({ where: { tenantId: context.tenantId, id }, data: { status: "WITHDRAWN" } });
      await tx.mediaScanJob.updateMany({ where: { tenantId: context.tenantId, mediaAssetId: id, status: "PENDING" }, data: { status: "FAILED", processedAt: new Date(), lastError: "Storage upload failed." } });
      await tx.storageOutbox.upsert({ where: { tenantId_idempotencyKey: { tenantId: context.tenantId, idempotencyKey: `media-delete:${id}` } }, create: { tenantId: context.tenantId, idempotencyKey: `media-delete:${id}`, storageKey: storedKey }, update: {} });
    });
    return redirectTo(request, escola, "error=storage");
  }

  const scan = await scanWithClamAv(bytes);
  if (scan === "CLEAN") {
    await prisma.mediaAsset.updateMany({ where: { tenantId: context.tenantId, id, status: "QUARANTINED" }, data: { status: "PENDING", scanStatus: "CLEAN" } });
    await prisma.mediaScanJob.updateMany({ where: { tenantId: context.tenantId, mediaAssetId: id, status: "PENDING" }, data: { status: "DONE", processedAt: new Date(), lastError: null } });
    return redirectTo(request, escola, "uploaded=1");
  }
  if (scan === "INFECTED") {
    let objectRemoved = true;
    try { await deletePrivateObject(storedKey); }
    catch { objectRemoved = false; }
    await prisma.$transaction(async (tx) => {
      await tx.mediaAsset.updateMany({ where: { tenantId: context.tenantId, id }, data: { status: "REJECTED", scanStatus: "INFECTED" } });
      await tx.mediaScanJob.updateMany({ where: { tenantId: context.tenantId, mediaAssetId: id, status: "PENDING" }, data: { status: "DONE", processedAt: new Date(), lastError: null } });
      if (!objectRemoved) await tx.storageOutbox.upsert({ where: { tenantId_idempotencyKey: { tenantId: context.tenantId, idempotencyKey: `media-delete:${id}` } }, create: { tenantId: context.tenantId, idempotencyKey: `media-delete:${id}`, storageKey: storedKey }, update: {} });
    });
    await prisma.mediaScanJob.updateMany({ where: { tenantId: context.tenantId, mediaAssetId: id, status: "PENDING" }, data: { status: "DONE", processedAt: new Date(), lastError: null } });
    return redirectTo(request, escola, objectRemoved ? "infected=1" : "infectedCleanupPending=1");
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
  return redirectTo(request, escola, "pendingScan=1");
}
