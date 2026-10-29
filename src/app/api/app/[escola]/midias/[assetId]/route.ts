import { NextResponse, type NextRequest } from "next/server";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";
import { getPrivateObject, isTenantObjectKey } from "@/server/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const staffRoles = [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT];
const filenameExtension: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ escola: string; assetId: string }> }) {
  const { escola, assetId } = await params;
  let context;
  try { context = await resolveTenantContext(escola); }
  catch (error) { return new NextResponse("Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }

  const guardian = context.role === MembershipRole.GUARDIAN;
  if (!guardian && !staffRoles.some((role) => role === context.role)) return new NextResponse("Acesso negado.", { status: 403 });
  let asset = guardian ? await prisma.mediaAsset.findFirst({
    where: {
      id: assetId, tenantId: context.tenantId, status: "PRIVATE", scanStatus: "CLEAN", storageKey: { not: null },
      uploadedByMembershipId: context.membershipId,
      student: { guardians: { some: { tenantId: context.tenantId, membershipId: context.membershipId, approved: true, revokedAt: null } } },
      consents: { some: { tenantId: context.tenantId, membershipId: context.membershipId, purpose: "PRIVATE_STORAGE", revokedAt: null } },
    }, select: { id: true, storageKey: true, contentType: true },
  }) : await prisma.mediaAsset.findFirst({
    where: {
      id: assetId, tenantId: context.tenantId, scanStatus: "CLEAN", storageKey: { not: null },
      OR: [
        { status: { in: ["PENDING", "PUBLISHED"] }, classroomId: { not: null }, ...(context.role === MembershipRole.TEACHER || context.role === MembershipRole.ASSISTANT ? { classroom: { staff: { some: { tenantId: context.tenantId, membershipId: context.membershipId } } } } : {}) },
        {
          status: "PRIVATE",
          consents: { some: { tenantId: context.tenantId, purpose: "SCHOOL_REVIEW", revokedAt: null } },
          submissions: { some: {
            tenantId: context.tenantId,
            status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
            student: { enrollments: { some: {
              tenantId: context.tenantId,
              status: "ACTIVE",
              ...(context.role === MembershipRole.TEACHER || context.role === MembershipRole.ASSISTANT ? { classroom: { staff: { some: { tenantId: context.tenantId, membershipId: context.membershipId } } } } : {}),
            } } },
          } },
        },
      ],
    }, select: { id: true, storageKey: true, contentType: true },
  });
  if (guardian && !asset) {
    const publication = await prisma.mediaPublication.findFirst({
      where: { tenantId: context.tenantId, status: "PUBLISHED", mediaAssetId: assetId, student: { guardians: { some: { tenantId: context.tenantId, membershipId: context.membershipId, approved: true, revokedAt: null, membership: { role: "GUARDIAN", status: "ACTIVE" } } } }, mediaAsset: { status: "PRIVATE", scanStatus: "CLEAN", storageKey: { not: null } }, consents: { some: { tenantId: context.tenantId, membershipId: context.membershipId, grantedAt: { not: null }, revokedAt: null } } },
      select: { studentId: true, mediaAsset: { select: { id: true, storageKey: true, contentType: true } }, consents: { where: { tenantId: context.tenantId, grantedAt: { not: null }, revokedAt: null }, select: { membershipId: true } } },
    });
    if (publication) {
      const guardians = await prisma.studentGuardian.findMany({ where: { tenantId: context.tenantId, studentId: publication.studentId, approved: true, revokedAt: null, membership: { role: "GUARDIAN", status: "ACTIVE" } }, select: { membershipId: true } });
      if (guardians.length > 0 && guardians.every((link) => publication.consents.some((consent) => consent.membershipId === link.membershipId))) asset = publication.mediaAsset;
    }
  }
  if (!asset?.storageKey || !isTenantObjectKey(asset.storageKey, context.tenantId, asset.id) || !asset.contentType || !filenameExtension[asset.contentType]) return new NextResponse(null, { status: 404 });

  try {
    const object = await getPrivateObject(asset.storageKey);
    const headers = new Headers({
      "Content-Type": asset.contentType,
      "Content-Disposition": `attachment; filename="turminha-${asset.id}.${filenameExtension[asset.contentType]}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
    if (object.contentLength !== undefined) headers.set("Content-Length", String(object.contentLength));
    return new NextResponse(Buffer.from(object.bytes), { status: 200, headers });
  } catch {
    return new NextResponse("Arquivo privado indisponível.", { status: 503 });
  }
}
