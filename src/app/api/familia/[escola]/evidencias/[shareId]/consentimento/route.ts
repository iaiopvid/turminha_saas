import { NextResponse, type NextRequest } from "next/server";
import { JournalEvidenceConsentAction, MembershipRole, MembershipStatus } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const TERMS_VERSION = "journal-family-v1";

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string; shareId: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola, shareId } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.GUARDIAN]); }
  catch (error) { return new NextResponse("Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const form = await request.formData();
  const action = form.get("action");
  const accepted = form.get("termsAccepted") === "yes";
  if (action !== "grant" && action !== "revoke") return new NextResponse("Ação inválida.", { status: 400 });
  if (action === "grant" && !accepted) return new NextResponse("A autorização explícita é obrigatória.", { status: 400 });

  try {
    await prisma.$transaction(async (tx) => {
      const activeMember = await tx.membership.findFirst({ where: { tenantId: context.tenantId, id: context.membershipId, userId: context.userId, role: MembershipRole.GUARDIAN, status: MembershipStatus.ACTIVE }, select: { id: true } });
      if (!activeMember) throw new Error("MEMBERSHIP_REVOKED");
      const share = await tx.journalEvidenceFamilyShare.findFirst({
        where: {
          id: shareId, tenantId: context.tenantId,
          enrollment: { status: "ACTIVE", student: { guardians: { some: { tenantId: context.tenantId, membershipId: activeMember.id, approved: true, revokedAt: null } } } },
          ...(action === "grant" ? { closedAt: null, evidence: { status: "PRIVATE", scanStatus: "CLEAN" } } : {}),
        },
        select: { id: true },
      });
      if (!share) throw new Error("SHARE_UNAVAILABLE");
      const latest = await tx.journalEvidenceFamilyConsent.findFirst({ where: { tenantId: context.tenantId, shareId: share.id, membershipId: activeMember.id }, select: { action: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const nextAction = action === "grant" ? JournalEvidenceConsentAction.GRANTED : JournalEvidenceConsentAction.REVOKED;
      if (latest?.action === nextAction) return;
      if (action === "revoke" && latest?.action !== JournalEvidenceConsentAction.GRANTED) throw new Error("CONSENT_NOT_ACTIVE");
      const createdAt = new Date(Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1));
      await tx.journalEvidenceFamilyConsent.create({ data: { tenantId: context.tenantId, shareId: share.id, membershipId: activeMember.id, action: nextAction, termsVersion: TERMS_VERSION, createdAt } });
    }, { isolationLevel: "Serializable" });
  } catch {
    return NextResponse.redirect(new URL(`/familia/${encodeURIComponent(escola)}?evidenceConsent=unavailable`, request.url), 303);
  }
  return NextResponse.redirect(new URL(`/familia/${encodeURIComponent(escola)}?evidenceConsent=${action === "grant" ? "granted" : "revoked"}`, request.url), 303);
}
