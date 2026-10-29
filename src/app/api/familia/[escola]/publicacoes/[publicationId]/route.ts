import { NextResponse, type NextRequest } from "next/server";
import { MembershipRole, Prisma } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string; publicationId: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola, publicationId } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.GUARDIAN]); }
  catch (error) { return new NextResponse("Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const form = await request.formData();
  const action = form.get("action");
  if (action !== "grant" && action !== "revoke") return new NextResponse("Ação inválida.", { status: 400 });
  let result = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await prisma.$transaction(async (tx) => {
    const consent = await tx.mediaPublicationConsent.findFirst({
      where: {
        tenantId: context.tenantId, publicationId, membershipId: context.membershipId,
        publication: {
          status: { in: ["AWAITING_CONSENT", "PUBLISHED"] },
          student: { guardians: { some: { tenantId: context.tenantId, membershipId: context.membershipId, approved: true, revokedAt: null, membership: { role: "GUARDIAN", status: "ACTIVE" } } } },
        },
      },
      select: { id: true, grantedAt: true, revokedAt: true, publication: { select: { id: true, studentId: true, status: true } } },
    });
    if (!consent) return false;
    const now = new Date();
    if (action === "grant") {
      if (consent.publication.status === "WITHDRAWN" || consent.revokedAt) return false;
      if (consent.publication.status === "PUBLISHED" && consent.grantedAt) return true;
      if (consent.publication.status !== "AWAITING_CONSENT") return false;
      if (!consent.grantedAt) {
        const changed = await tx.mediaPublicationConsent.updateMany({ where: { tenantId: context.tenantId, id: consent.id, grantedAt: null, revokedAt: null }, data: { grantedAt: now } });
        if (changed.count !== 1) return false;
        await tx.mediaPublicationEvent.create({ data: { tenantId: context.tenantId, publicationId: consent.publication.id, consentId: consent.id, actorMembershipId: context.membershipId, actorDisplayName: context.displayName, actorRole: context.role, action: "CONSENT_GRANTED" } });
      }
      const guardians = await tx.studentGuardian.findMany({ where: { tenantId: context.tenantId, studentId: consent.publication.studentId, approved: true, revokedAt: null, membership: { role: "GUARDIAN", status: "ACTIVE" } }, select: { membershipId: true } });
      const grants = await tx.mediaPublicationConsent.findMany({ where: { tenantId: context.tenantId, publicationId: consent.publication.id, grantedAt: { not: null }, revokedAt: null }, select: { membershipId: true } });
      if (guardians.length > 0 && guardians.every((guardian) => grants.some((grant) => grant.membershipId === guardian.membershipId))) {
        const published = await tx.mediaPublication.updateMany({ where: { tenantId: context.tenantId, id: consent.publication.id, status: "AWAITING_CONSENT" }, data: { status: "PUBLISHED", publishedAt: now } });
        if (published.count === 1) await tx.mediaPublicationEvent.create({ data: { tenantId: context.tenantId, publicationId: consent.publication.id, actorMembershipId: context.membershipId, actorDisplayName: context.displayName, actorRole: context.role, action: "PUBLISHED_AFTER_ALL_CONSENTS" } });
      }
      return true;
    }
    if (!consent.grantedAt || consent.revokedAt) return false;
    await tx.mediaPublicationConsent.updateMany({ where: { tenantId: context.tenantId, id: consent.id, revokedAt: null }, data: { revokedAt: now } });
    await tx.mediaPublication.updateMany({ where: { tenantId: context.tenantId, id: consent.publication.id, status: { in: ["AWAITING_CONSENT", "PUBLISHED"] } }, data: { status: "WITHDRAWN", withdrawnAt: now } });
    await tx.mediaPublicationEvent.create({ data: { tenantId: context.tenantId, publicationId: consent.publication.id, consentId: consent.id, actorMembershipId: context.membershipId, actorDisplayName: context.displayName, actorRole: context.role, action: "CONSENT_REVOKED" } });
      return true;
      }, { isolationLevel: "Serializable" });
      break;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  if (!result) return new NextResponse("Solicitação fora do seu vínculo ou já atualizada.", { status: 409 });
  return NextResponse.redirect(new URL(`/familia/${encodeURIComponent(escola)}?publication=${action === "grant" ? "granted" : "revoked"}`, request.url), 303);
}
