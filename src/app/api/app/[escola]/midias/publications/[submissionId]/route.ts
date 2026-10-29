import { NextResponse, type NextRequest } from "next/server";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const staffRoles = [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT];

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string; submissionId: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola, submissionId } = await params;
  let context;
  try { context = await resolveTenantContext(escola, staffRoles); }
  catch (error) { return new NextResponse("Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const submission = await prisma.mediaSubmission.findFirst({
    where: {
      id: submissionId, tenantId: context.tenantId, status: "APPROVED",
      mediaAsset: { status: "PRIVATE", scanStatus: "CLEAN", consents: { some: { tenantId: context.tenantId, purpose: "SCHOOL_REVIEW", revokedAt: null } } },
      student: {
        guardians: { some: { tenantId: context.tenantId, approved: true, revokedAt: null, membership: { role: "GUARDIAN", status: "ACTIVE" } } },
        enrollments: { some: { tenantId: context.tenantId, status: "ACTIVE", ...(context.role === "TEACHER" || context.role === "ASSISTANT" ? { classroom: { staff: { some: { tenantId: context.tenantId, membershipId: context.membershipId } } } } : {}) } },
      },
    },
    select: { id: true, mediaAssetId: true, studentId: true },
  });
  if (!submission) return new NextResponse("Envio aprovado fora do seu escopo.", { status: 404 });

  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.mediaPublication.findFirst({ where: { tenantId: context.tenantId, mediaAssetId: submission.mediaAssetId, status: { in: ["AWAITING_CONSENT", "PUBLISHED"] } }, select: { id: true } });
    if (existing) return false;
    const guardians = await tx.studentGuardian.findMany({ where: { tenantId: context.tenantId, studentId: submission.studentId, approved: true, revokedAt: null, membership: { role: "GUARDIAN", status: "ACTIVE" } }, select: { membershipId: true } });
    if (!guardians.length) return false;
    const publication = await tx.mediaPublication.create({ data: { tenantId: context.tenantId, mediaAssetId: submission.mediaAssetId, studentId: submission.studentId, requestedByMembershipId: context.membershipId }, select: { id: true } });
    await tx.mediaPublicationConsent.createMany({ data: guardians.map(({ membershipId }) => ({ tenantId: context.tenantId, publicationId: publication.id, membershipId })) });
    await tx.mediaPublicationEvent.create({ data: { tenantId: context.tenantId, publicationId: publication.id, actorMembershipId: context.membershipId, actorDisplayName: context.displayName, actorRole: context.role, action: "PUBLICATION_REQUESTED", detail: "Portfólio individual da criança; consentimentos familiares pendentes." } });
    return true;
  }, { isolationLevel: "Serializable" });
  if (!created) return new NextResponse("Já existe uma publicação ativa ou não há responsáveis ativos.", { status: 409 });
  return NextResponse.redirect(new URL(`/app/${encodeURIComponent(escola)}/midias?publication=requested`, request.url), 303);
}
