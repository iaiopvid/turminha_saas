import { NextResponse, type NextRequest } from "next/server";
import { EnrollmentStatus, MembershipRole, MembershipStatus } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string; entryId: string; evidenceId: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola, entryId, evidenceId } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT]); }
  catch (error) { return new NextResponse("Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const form = await request.formData();
  const action = form.get("action") === "close" ? "close" : "request";
  const enrollmentId = form.get("enrollmentId");
  if (typeof enrollmentId !== "string" || !enrollmentId || enrollmentId.length > 30) return new NextResponse("Participação inválida.", { status: 400 });

  try {
    await prisma.$transaction(async (tx) => {
      const member = await tx.membership.findFirst({ where: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, status: MembershipStatus.ACTIVE, role: context.role }, select: { id: true } });
      if (!member) throw new Error("SCOPE_REVOKED");
      const evidence = await tx.journalEvidence.findFirst({
        where: {
          id: evidenceId, tenantId: context.tenantId, journalEntryId: entryId, ...(action === "request" ? { status: "PRIVATE", scanStatus: "CLEAN" } : {}),
          journalEntry: { classroom: { status: EnrollmentStatus.ACTIVE, ...(context.role === MembershipRole.SCHOOL_ADMIN || context.role === MembershipRole.COORDINATOR ? {} : { staff: { some: { tenantId: context.tenantId, membershipId: member.id } } }) }, participants: { some: { tenantId: context.tenantId, enrollmentId } } },
        },
        select: { id: true },
      });
      const enrollment = await tx.enrollment.findFirst({
        where: { tenantId: context.tenantId, id: enrollmentId, status: EnrollmentStatus.ACTIVE },
        select: {
          id: true,
          student: {
            select: {
              guardians: {
                where: { tenantId: context.tenantId, approved: true, revokedAt: null, membership: { role: MembershipRole.GUARDIAN, status: MembershipStatus.ACTIVE } },
                select: { id: true },
              },
            },
          },
        },
      });
      if (!evidence || !enrollment || enrollment.student.guardians.length === 0) throw new Error("RESOURCE_FORBIDDEN");

      const existing = await tx.journalEvidenceFamilyShare.findUnique({ where: { tenantId_journalEvidenceId_enrollmentId: { tenantId: context.tenantId, journalEvidenceId: evidence.id, enrollmentId } }, select: { id: true, closedAt: true } });
      if (action === "close") {
        if (!existing || existing.closedAt) throw new Error("SHARE_NOT_OPEN");
        const events = await tx.journalEvidenceFamilyConsent.findMany({ where: { tenantId: context.tenantId, shareId: existing.id }, select: { id: true, membershipId: true, action: true, createdAt: true }, orderBy: [{ membershipId: "asc" }, { createdAt: "desc" }, { id: "desc" }] });
        const seen = new Set<string>();
        const activeConsents = events.filter((event) => { if (seen.has(event.membershipId)) return false; seen.add(event.membershipId); return event.action === "GRANTED"; });
        if (activeConsents.length) await tx.journalEvidenceFamilyConsent.createMany({ data: activeConsents.map((event) => ({ tenantId: context.tenantId, shareId: existing.id, membershipId: event.membershipId, action: "REVOKED", termsVersion: "journal-family-v1", createdAt: new Date(Math.max(Date.now(), event.createdAt.getTime() + 1)) })) });
        await tx.journalEvidenceFamilyShare.updateMany({ where: { tenantId: context.tenantId, id: existing.id, closedAt: null }, data: { closedAt: new Date() } });
        return;
      }
      if (existing?.closedAt === null) return;
      if (existing) {
        const latest = await tx.journalEvidenceFamilyConsent.findMany({ where: { tenantId: context.tenantId, shareId: existing.id }, select: { membershipId: true, action: true, createdAt: true, id: true }, orderBy: [{ membershipId: "asc" }, { createdAt: "desc" }, { id: "desc" }] });
        const seen = new Set<string>();
        const activeConsents = latest.filter((event) => { if (seen.has(event.membershipId)) return false; seen.add(event.membershipId); return event.action === "GRANTED"; });
        if (activeConsents.length) await tx.journalEvidenceFamilyConsent.createMany({ data: activeConsents.map((event) => ({ tenantId: context.tenantId, shareId: existing.id, membershipId: event.membershipId, action: "REVOKED", termsVersion: "journal-family-v1", createdAt: new Date(Math.max(Date.now(), event.createdAt.getTime() + 1)) })) });
        await tx.journalEvidenceFamilyShare.updateMany({ where: { tenantId: context.tenantId, id: existing.id }, data: { requestedByMembershipId: member.id, requestedAt: new Date(), closedAt: null } });
      } else {
        await tx.journalEvidenceFamilyShare.create({ data: { tenantId: context.tenantId, journalEvidenceId: evidence.id, enrollmentId, requestedByMembershipId: member.id } });
      }
    }, { isolationLevel: "Serializable" });
  } catch {
    return new NextResponse("Evidência fora do escopo ou indisponível.", { status: 404 });
  }
  return NextResponse.redirect(new URL(`/app/${encodeURIComponent(escola)}/diario?entry=${encodeURIComponent(entryId)}&${action === "close" ? "shareClosed" : "shareRequested"}=1`, request.url), 303);
}
