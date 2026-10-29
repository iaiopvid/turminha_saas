import { NextResponse, type NextRequest } from "next/server";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string; assetId: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola, assetId } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.GUARDIAN]); }
  catch (error) { return new NextResponse("Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const form = await request.formData();
  const purpose = form.get("purpose");
  if (purpose !== "PRIVATE_STORAGE" && purpose !== "SCHOOL_REVIEW") return new NextResponse("Finalidade inválida.", { status: 400 });

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, tenantId: context.tenantId, uploadedByMembershipId: context.membershipId, studentId: { not: null }, student: { guardians: { some: { tenantId: context.tenantId, membershipId: context.membershipId, approved: true, revokedAt: null } } }, consents: { some: { tenantId: context.tenantId, membershipId: context.membershipId, purpose: "PRIVATE_STORAGE", revokedAt: null } } },
    select: { id: true, storageKey: true },
  });
  if (!asset) return new NextResponse(null, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.mediaConsent.updateMany({ where: { tenantId: context.tenantId, mediaAssetId: asset.id, membershipId: context.membershipId, purpose, revokedAt: null }, data: { revokedAt: new Date() } });
    if (purpose === "SCHOOL_REVIEW") {
      const submissions = await tx.mediaSubmission.findMany({ where: { tenantId: context.tenantId, mediaAssetId: asset.id, submittedByMembershipId: context.membershipId, status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "CHANGES_REQUESTED"] } }, select: { id: true, status: true } });
      await tx.mediaSubmission.updateMany({ where: { tenantId: context.tenantId, id: { in: submissions.map((item) => item.id) } }, data: { status: "WITHDRAWN", reviewedAt: new Date() } });
      for (const submission of submissions) await tx.mediaReviewEvent.create({ data: { tenantId: context.tenantId, submissionId: submission.id, actorMembershipId: context.membershipId, actorDisplayName: context.displayName, actorRole: MembershipRole.GUARDIAN, fromStatus: submission.status, toStatus: "WITHDRAWN", comment: "Responsável retirou o consentimento de revisão." } });
    } else {
      await tx.mediaAsset.updateMany({ where: { tenantId: context.tenantId, id: asset.id }, data: { status: "WITHDRAWN" } });
      await tx.mediaConsent.updateMany({ where: { tenantId: context.tenantId, mediaAssetId: asset.id, revokedAt: null }, data: { revokedAt: new Date() } });
      const submissions = await tx.mediaSubmission.findMany({ where: { tenantId: context.tenantId, mediaAssetId: asset.id, status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "CHANGES_REQUESTED"] } }, select: { id: true, status: true } });
      await tx.mediaSubmission.updateMany({ where: { tenantId: context.tenantId, id: { in: submissions.map((item) => item.id) } }, data: { status: "WITHDRAWN", reviewedAt: new Date() } });
      for (const submission of submissions) await tx.mediaReviewEvent.create({ data: { tenantId: context.tenantId, submissionId: submission.id, actorMembershipId: context.membershipId, actorDisplayName: context.displayName, actorRole: MembershipRole.GUARDIAN, fromStatus: submission.status, toStatus: "WITHDRAWN", comment: "Responsável removeu a recordação do armazenamento privado." } });
      if (asset.storageKey) await tx.storageOutbox.upsert({ where: { tenantId_idempotencyKey: { tenantId: context.tenantId, idempotencyKey: `media-delete:${asset.id}` } }, create: { tenantId: context.tenantId, idempotencyKey: `media-delete:${asset.id}`, storageKey: asset.storageKey }, update: {} });
    }
  });
  return NextResponse.redirect(new URL(`/familia/${encodeURIComponent(escola)}?memory=withdrawn`, request.url), 303);
}
