import "server-only";
import { MembershipRole } from "@/generated/prisma/client";
import type { TenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const PAGE_SIZE = 10;
const TIMELINE_PAGE_SIZE = 12;

type TimelineCursor = { at: string; id: string };
function parseTimelineCursor(value: string | undefined, context: TenantContext): TimelineCursor | null {
  if (!value || value.length > 512) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<TimelineCursor> & { tenantId?: string; membershipId?: string; filter?: string };
    if (decoded.tenantId !== context.tenantId || decoded.membershipId !== context.membershipId || decoded.filter !== "authorized-evidence-v1" || typeof decoded.at !== "string" || !Number.isFinite(Date.parse(decoded.at)) || typeof decoded.id !== "string" || decoded.id.length > 30) return null;
    return { at: decoded.at, id: decoded.id };
  } catch { return null; }
}

export async function getFamilyAuthorizedTimeline(context: TenantContext, cursorValue?: string) {
  if (context.role !== MembershipRole.GUARDIAN) return null;
  if (cursorValue && !parseTimelineCursor(cursorValue, context)) return { items: [], nextCursor: null, hasMore: false };
  const cursor = parseTimelineCursor(cursorValue, context);
  let after = cursor;
  const items: { entryId: string; title: string; happenedAt: string; studentName: string; evidenceId: string; shareId: string }[] = [];
  let exhausted = false;
  let lastScanned: TimelineCursor | null = after;
  while (items.length < TIMELINE_PAGE_SIZE + 1 && !exhausted) {
    const candidates = await prisma.journalEntry.findMany({
      where: {
        tenantId: context.tenantId,
        status: "RECORDED",
        ...(after ? { OR: [{ happenedAt: { lt: new Date(after.at) } }, { happenedAt: new Date(after.at), id: { lt: after.id } }] } : {}),
        participants: {
          some: {
            enrollment: {
              status: "ACTIVE",
              student: { guardians: { some: { tenantId: context.tenantId, membershipId: context.membershipId, approved: true, revokedAt: null, membership: { status: "ACTIVE", role: MembershipRole.GUARDIAN } } } },
            },
          },
        },
        evidence: { some: { tenantId: context.tenantId, status: "PRIVATE", scanStatus: "CLEAN" } },
      },
      select: {
        id: true, title: true, happenedAt: true,
        participants: {
          select: {
            enrollmentId: true,
            enrollment: {
              select: {
                status: true,
                student: {
                  select: {
                    displayName: true,
                    guardians: {
                      where: { tenantId: context.tenantId, approved: true, revokedAt: null, membership: { status: "ACTIVE", role: MembershipRole.GUARDIAN } },
                      select: { membershipId: true },
                    },
                  },
                },
              },
            },
          },
        },
        evidence: { where: { tenantId: context.tenantId, status: "PRIVATE", scanStatus: "CLEAN" }, select: { id: true } },
      },
      orderBy: [{ happenedAt: "desc" }, { id: "desc" }],
      take: 48,
    });
    if (!candidates.length) { exhausted = true; break; }
    const evidenceIds = candidates.flatMap((entry) => entry.evidence.map((evidence) => evidence.id));
    const enrollmentIds = [...new Set(candidates.flatMap((entry) => entry.participants.map((participant) => participant.enrollmentId)))];
    const guardianIds = [...new Set(candidates.flatMap((entry) => entry.participants.flatMap((participant) => participant.enrollment.student.guardians.map((guardian) => guardian.membershipId))))];
    const shares = evidenceIds.length && enrollmentIds.length ? await prisma.journalEvidenceFamilyShare.findMany({ where: { tenantId: context.tenantId, journalEvidenceId: { in: evidenceIds }, enrollmentId: { in: enrollmentIds }, closedAt: null }, select: { id: true, journalEvidenceId: true, enrollmentId: true } }) : [];
    const events = shares.length && guardianIds.length ? await prisma.journalEvidenceFamilyConsent.findMany({ where: { tenantId: context.tenantId, shareId: { in: shares.map((share) => share.id) }, membershipId: { in: guardianIds } }, select: { shareId: true, membershipId: true, action: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }) : [];
    const latest = new Map<string, string>();
    for (const event of events) { const key = `${event.shareId}:${event.membershipId}`; if (!latest.has(key)) latest.set(key, event.action); }
    const shareByPair = new Map(shares.map((share) => [`${share.journalEvidenceId}:${share.enrollmentId}`, share]));
    for (const entry of candidates) {
      lastScanned = { at: entry.happenedAt.toISOString(), id: entry.id };
      const currentFamilyParticipants = entry.participants.filter((participant) => participant.enrollment.status === "ACTIVE" && participant.enrollment.student.guardians.some((guardian) => guardian.membershipId === context.membershipId));
      for (const evidence of entry.evidence) {
        const allGuardiansReady = entry.participants.length > 0 && entry.participants.every((participant) => {
          const guardians = participant.enrollment.student.guardians;
          const share = shareByPair.get(`${evidence.id}:${participant.enrollmentId}`);
          return participant.enrollment.status === "ACTIVE" && guardians.length > 0 && !!share && guardians.every((guardian) => latest.get(`${share.id}:${guardian.membershipId}`) === "GRANTED");
        });
        if (!allGuardiansReady) continue;
        const familyParticipant = currentFamilyParticipants.find((participant) => shareByPair.has(`${evidence.id}:${participant.enrollmentId}`));
        const share = familyParticipant && shareByPair.get(`${evidence.id}:${familyParticipant.enrollmentId}`);
        if (!familyParticipant || !share || latest.get(`${share.id}:${context.membershipId}`) !== "GRANTED") continue;
        items.push({ entryId: entry.id, title: entry.title, happenedAt: entry.happenedAt.toISOString(), studentName: familyParticipant.enrollment.student.displayName, evidenceId: evidence.id, shareId: share.id });
        break;
      }
    }
    after = lastScanned;
    exhausted = candidates.length < 48;
  }
  const hasMore = items.length > TIMELINE_PAGE_SIZE || !exhausted;
  const visible = items.slice(0, TIMELINE_PAGE_SIZE);
  const nextCursor = hasMore && visible.length ? Buffer.from(JSON.stringify({ tenantId: context.tenantId, membershipId: context.membershipId, filter: "authorized-evidence-v1", at: visible[visible.length - 1]!.happenedAt, id: visible[visible.length - 1]!.entryId })).toString("base64url") : null;
  return { items: visible, nextCursor, hasMore };
}

export async function getFamilyEvidenceRequests(context: TenantContext, requestedPage: number) {
  if (context.role !== MembershipRole.GUARDIAN) return null;
  const page = Number.isSafeInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
  const where = {
    tenantId: context.tenantId,
    closedAt: null,
    enrollment: {
      status: "ACTIVE" as const,
      student: { guardians: { some: { tenantId: context.tenantId, membershipId: context.membershipId, approved: true, revokedAt: null } } },
    },
    evidence: { tenantId: context.tenantId, status: "PRIVATE", scanStatus: "CLEAN" },
  };
  const total = await prisma.journalEvidenceFamilyShare.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const items = await prisma.journalEvidenceFamilyShare.findMany({
    where,
    select: {
      id: true,
      requestedAt: true,
      enrollment: { select: { student: { select: { displayName: true } }, classroom: { select: { name: true } } } },
      evidence: {
        select: {
          id: true,
          originalFilename: true,
          journalEntry: {
            select: {
              title: true,
              happenedAt: true,
              participants: {
                select: {
                  enrollmentId: true,
                  enrollment: {
                    select: {
                      student: {
                        select: {
                          guardians: {
                            where: { tenantId: context.tenantId, approved: true, revokedAt: null, membership: { role: MembershipRole.GUARDIAN, status: "ACTIVE" } },
                            select: { membershipId: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      consentEvents: { where: { tenantId: context.tenantId, membershipId: context.membershipId }, select: { action: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
    },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const evidenceIds = [...new Set(items.map((item) => item.evidence.id))];
  const enrollmentIds = [...new Set(items.flatMap((item) => item.evidence.journalEntry.participants.map((participant) => participant.enrollmentId)))];
  const membershipIds = [...new Set(items.flatMap((item) => item.evidence.journalEntry.participants.flatMap((participant) => participant.enrollment.student.guardians.map((guardian) => guardian.membershipId))))];
  const shares = evidenceIds.length && enrollmentIds.length ? await prisma.journalEvidenceFamilyShare.findMany({ where: { tenantId: context.tenantId, journalEvidenceId: { in: evidenceIds }, enrollmentId: { in: enrollmentIds }, closedAt: null }, select: { id: true, journalEvidenceId: true, enrollmentId: true } }) : [];
  const events = shares.length && membershipIds.length ? await prisma.journalEvidenceFamilyConsent.findMany({ where: { tenantId: context.tenantId, shareId: { in: shares.map((share) => share.id) }, membershipId: { in: membershipIds } }, select: { shareId: true, membershipId: true, action: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }) : [];
  const latest = new Map<string, string>();
  for (const event of events) { const key = `${event.shareId}:${event.membershipId}`; if (!latest.has(key)) latest.set(key, event.action); }
  const shareByEvidenceEnrollment = new Map(shares.map((share) => [`${share.journalEvidenceId}:${share.enrollmentId}`, share.id]));
  const itemsWithReadiness = items.map((item) => {
    const participants = item.evidence.journalEntry.participants;
    const consentReady = participants.length > 0 && participants.every((participant) => {
      const guardians = participant.enrollment.student.guardians;
      const shareId = shareByEvidenceEnrollment.get(`${item.evidence.id}:${participant.enrollmentId}`);
      return guardians.length > 0 && !!shareId && guardians.every((guardian) => latest.get(`${shareId}:${guardian.membershipId}`) === "GRANTED");
    });
    return { ...item, consentReady };
  });
  return { page: currentPage, pageCount, total, items: itemsWithReadiness };
}
