import { NextResponse } from "next/server";
import { MembershipRole, MembershipStatus } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";
import { getPrivateObject, isTenantStorageKey } from "@/server/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ escola: string; shareId: string }> }) {
  const { escola, shareId } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.GUARDIAN]); }
  catch (error) { return new NextResponse("Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const activeMember = await prisma.membership.findFirst({ where: { tenantId: context.tenantId, id: context.membershipId, userId: context.userId, role: MembershipRole.GUARDIAN, status: MembershipStatus.ACTIVE }, select: { id: true } });
  if (!activeMember) return new NextResponse(null, { status: 403 });
  const share = await prisma.journalEvidenceFamilyShare.findFirst({
    where: {
      id: shareId, tenantId: context.tenantId, closedAt: null,
      enrollment: { status: "ACTIVE", student: { guardians: { some: { tenantId: context.tenantId, membershipId: activeMember.id, approved: true, revokedAt: null } } } },
      evidence: { status: "PRIVATE", scanStatus: "CLEAN" },
    },
    select: {
      id: true, enrollment: { select: { studentId: true } },
      evidence: { select: { id: true, journalEntryId: true, storageKey: true, byteSize: true, contentType: true } },
      consentEvents: { where: { tenantId: context.tenantId, membershipId: activeMember.id }, select: { action: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
    },
  });
  const latest = share?.consentEvents[0]?.action;
  if (!share || latest !== "GRANTED" || !isTenantStorageKey(share.evidence.storageKey, context.tenantId) || share.evidence.contentType !== "image/webp") return new NextResponse(null, { status: 404 });
  const participants = await prisma.journalParticipant.findMany({
    where: { tenantId: context.tenantId, journalEntryId: share.evidence.journalEntryId },
    select: {
      enrollmentId: true,
      enrollment: {
        select: {
          student: {
            select: {
              guardians: {
                where: { tenantId: context.tenantId, approved: true, revokedAt: null, membership: { role: MembershipRole.GUARDIAN, status: MembershipStatus.ACTIVE } },
                select: { membershipId: true },
              },
            },
          },
        },
      },
    },
  });
  const enrollmentIds = participants.map((participant) => participant.enrollmentId);
  const guardianMembershipIds = [...new Set(participants.flatMap((participant) => participant.enrollment.student.guardians.map((guardian) => guardian.membershipId)))];
  if (!participants.length || participants.some((participant) => participant.enrollment.student.guardians.length === 0)) return new NextResponse(null, { status: 404 });
  const shares = await prisma.journalEvidenceFamilyShare.findMany({ where: { tenantId: context.tenantId, journalEvidenceId: share.evidence.id, enrollmentId: { in: enrollmentIds }, closedAt: null }, select: { id: true, enrollmentId: true } });
  if (shares.length !== enrollmentIds.length) return new NextResponse(null, { status: 404 });
  const events = await prisma.journalEvidenceFamilyConsent.findMany({ where: { tenantId: context.tenantId, shareId: { in: shares.map((item) => item.id) }, membershipId: { in: guardianMembershipIds } }, select: { shareId: true, membershipId: true, action: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const latestByPair = new Map<string, string>();
  for (const event of events) { const key = `${event.shareId}:${event.membershipId}`; if (!latestByPair.has(key)) latestByPair.set(key, event.action); }
  const shareByEnrollment = new Map(shares.map((item) => [item.enrollmentId, item.id]));
  const everyGuardianConsented = participants.every((participant) => {
    const shareId = shareByEnrollment.get(participant.enrollmentId);
    return !!shareId && participant.enrollment.student.guardians.every((guardian) => latestByPair.get(`${shareId}:${guardian.membershipId}`) === "GRANTED");
  });
  if (!everyGuardianConsented) return new NextResponse(null, { status: 404 });
  try {
    const object = await getPrivateObject(share.evidence.storageKey);
    return new NextResponse(Buffer.from(object.bytes), { status: 200, headers: {
      "Content-Type": "image/webp",
      "Content-Disposition": `attachment; filename="turminha-evidencia-${share.evidence.id}.webp"`,
      "Content-Length": String(share.evidence.byteSize),
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch { return new NextResponse("Arquivo privado indisponível.", { status: 503 }); }
}
