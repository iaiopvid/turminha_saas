import "server-only";
import { MediaSubmissionStatus, MembershipRole, Prisma } from "@/generated/prisma/client";
import type { TenantContext } from "@/server/tenancy/context";
import type { listAuthorizedClassrooms } from "@/server/tenancy/repositories";
import { prisma } from "@/server/db/prisma";

const PAGE_SIZE = 20;
const statuses = [MediaSubmissionStatus.SUBMITTED, MediaSubmissionStatus.UNDER_REVIEW, MediaSubmissionStatus.APPROVED, MediaSubmissionStatus.CHANGES_REQUESTED, MediaSubmissionStatus.REJECTED, MediaSubmissionStatus.WITHDRAWN] as const;

function parseDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function getMediaReviewPage(context: TenantContext, classrooms: Awaited<ReturnType<typeof listAuthorizedClassrooms>>, params: { page?: string; status?: string; classroomId?: string; studentId?: string; authorId?: string; from?: string; to?: string }) {
  const permittedClassIds = classrooms.map((item) => item.id);
  const selectedClassroomValid = !params.classroomId || permittedClassIds.includes(params.classroomId);
  const classIds = params.classroomId && selectedClassroomValid ? [params.classroomId] : permittedClassIds;
  const activeClassScope = { tenantId: context.tenantId, status: "ACTIVE" as const, classroomId: { in: classIds } };
  const submissionBase: Prisma.MediaSubmissionWhereInput = {
    tenantId: context.tenantId,
    student: { enrollments: { some: activeClassScope } },
    submittedBy: { guardianLinks: { some: { tenantId: context.tenantId, approved: true, revokedAt: null } } },
    mediaAsset: { status: "PRIVATE", scanStatus: "CLEAN", consents: { some: { tenantId: context.tenantId, purpose: "SCHOOL_REVIEW", revokedAt: null } } },
  };
  const selectedStatus = params.status === "ALL" || params.status === "OPEN" || statuses.includes(params.status as (typeof statuses)[number]) ? params.status ?? "OPEN" : "OPEN";
  const statusFilter: MediaSubmissionStatus[] = selectedStatus === "ALL" ? [...statuses] : selectedStatus === "OPEN" ? [MediaSubmissionStatus.SUBMITTED, MediaSubmissionStatus.UNDER_REVIEW] : [selectedStatus as (typeof statuses)[number]];
  const from = parseDate(params.from);
  const toDate = parseDate(params.to);
  const to = toDate ? new Date(toDate.getTime() + 24 * 60 * 60 * 1000) : undefined;
  const where: Prisma.MediaSubmissionWhereInput = {
    ...submissionBase,
    status: { in: statusFilter },
    ...(selectedClassroomValid ? {} : { id: "__invalid_classroom_filter__" }),
    ...(params.studentId ? { studentId: params.studentId } : {}),
    ...(params.authorId ? { submittedByMembershipId: params.authorId } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };
  const pageCandidate = Number.parseInt(params.page ?? "1", 10);
  const requestedPage = Number.isSafeInteger(pageCandidate) && pageCandidate > 0 ? pageCandidate : 1;
  const [total, students, authors] = await Promise.all([
    prisma.mediaSubmission.count({ where }),
    classIds.length ? prisma.student.findMany({ where: { tenantId: context.tenantId, enrollments: { some: activeClassScope } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" }, take: 250 }) : [],
    classIds.length ? prisma.membership.findMany({ where: { tenantId: context.tenantId, role: MembershipRole.GUARDIAN, mediaSubmissions: { some: submissionBase } }, select: { id: true, user: { select: { displayName: true } } }, orderBy: { user: { displayName: "asc" } }, take: 250 }) : [],
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const items = classIds.length ? await prisma.mediaSubmission.findMany({
    where,
    select: {
      id: true, status: true, version: true, threadId: true, reviewComment: true, createdAt: true, reviewedAt: true,
      student: { select: { id: true, displayName: true } },
      submittedBy: { select: { id: true, user: { select: { displayName: true, email: true } } } },
      mediaAsset: { select: { id: true, title: true, category: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  }) : [];
  const threads = [...new Set(items.map((item) => item.threadId ?? item.id))];
  const history = threads.length ? await prisma.mediaSubmission.findMany({
    where: { tenantId: context.tenantId, OR: [{ threadId: { in: threads } }, { id: { in: threads } }], student: { enrollments: { some: activeClassScope } }, mediaAsset: { status: "PRIVATE", consents: { some: { tenantId: context.tenantId, purpose: "SCHOOL_REVIEW", revokedAt: null } } } },
    select: { id: true, threadId: true, version: true, events: { where: { tenantId: context.tenantId }, select: { id: true, fromStatus: true, toStatus: true, comment: true, createdAt: true, actorDisplayName: true, actorRole: true }, orderBy: { createdAt: "asc" } } },
    orderBy: { version: "asc" },
  }) : [];
  const historyByThread = new Map<string, typeof history>();
  for (const version of history) { const threadId = version.threadId ?? version.id; historyByThread.set(threadId, [...(historyByThread.get(threadId) ?? []), version]); }
  return { items: items.map((item) => ({ ...item, history: historyByThread.get(item.threadId ?? item.id) ?? [] })), total, page, pageCount, pageSize: PAGE_SIZE, students, authors: authors.map((item) => ({ id: item.id, displayName: item.user.displayName })), filters: { status: selectedStatus, classroomId: selectedClassroomValid ? params.classroomId ?? "" : "", studentId: params.studentId ?? "", authorId: params.authorId ?? "", from: params.from ?? "", to: params.to ?? "" } };
}
