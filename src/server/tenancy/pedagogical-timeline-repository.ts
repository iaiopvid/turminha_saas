import "server-only";
import { EnrollmentStatus, MembershipRole, type Prisma } from "@/generated/prisma/client";
import type { TenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const PAGE_SIZE = 10;
const TEAM_ROLES = [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER] as const;

function parseDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : date;
}

export async function getClassroomPedagogicalTimeline(context: TenantContext, input: {
  classroomId: string;
  page?: number;
  from?: string;
  to?: string;
  enrollmentId?: string;
  learningPlanId?: string;
}) {
  if (!TEAM_ROLES.includes(context.role as (typeof TEAM_ROLES)[number])) return null;
  const classroom = await prisma.classroom.findFirst({
    where: {
      id: input.classroomId,
      tenantId: context.tenantId,
      status: EnrollmentStatus.ACTIVE,
      ...(context.role === MembershipRole.SCHOOL_ADMIN || context.role === MembershipRole.COORDINATOR ? {} : { staff: { some: { tenantId: context.tenantId, membershipId: context.membershipId } } }),
    },
    select: { id: true, name: true },
  });
  if (!classroom) return null;

  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId: context.tenantId, classroomId: classroom.id },
    select: { id: true, status: true, student: { select: { displayName: true } } },
    orderBy: [{ student: { displayName: "asc" } }, { id: "asc" }],
    take: 200,
  });
  const plans = await prisma.learningPlan.findMany({
    where: { tenantId: context.tenantId, classroomId: classroom.id },
    select: { id: true, title: true, version: true },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }, { version: "desc" }],
    take: 200,
  });
  const selectedEnrollment = input.enrollmentId ? enrollments.find((item) => item.id === input.enrollmentId) : undefined;
  const invalidEnrollmentFilter = Boolean(input.enrollmentId && !selectedEnrollment);
  const selectedPlan = input.learningPlanId ? plans.find((item) => item.id === input.learningPlanId) : undefined;
  const invalidPlanFilter = Boolean(input.learningPlanId && !selectedPlan);
  const fromDate = parseDate(input.from);
  const toDate = parseDate(input.to);
  const hasDateFilter = Boolean(input.from || input.to);
  const validRange = (!input.from || !!fromDate) && (!input.to || !!toDate) && (!fromDate || !toDate || fromDate <= toDate);
  const pageFilter = Number.isSafeInteger(input.page) ? Math.max(1, input.page ?? 1) : 1;
  const where: Prisma.JournalEntryWhereInput = {
    tenantId: context.tenantId,
    classroomId: classroom.id,
    status: "RECORDED",
    ...(hasDateFilter ? validRange ? { happenedAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : { id: "__invalid_date_range__" } : {}),
    ...(invalidEnrollmentFilter ? { id: "__invalid_enrollment_filter__" } : {}),
    ...(invalidPlanFilter ? { id: "__invalid_learning_plan_filter__" } : {}),
    ...(selectedEnrollment ? { participants: { some: { tenantId: context.tenantId, enrollmentId: selectedEnrollment.id } } } : {}),
    ...(selectedPlan ? { learningPlanId: selectedPlan.id } : {}),
  };
  const result = await prisma.$transaction(async (tx) => {
    const total = await tx.journalEntry.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(pageFilter, pageCount);
    const entries = await tx.journalEntry.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        materials: true,
        happenedAt: true,
        createdAt: true,
        learningPlan: { select: { title: true, version: true } },
        author: { select: { user: { select: { displayName: true } } } },
        participants: {
          where: { tenantId: context.tenantId },
          select: { enrollmentId: true, observation: true, enrollment: { select: { student: { select: { displayName: true } } } } },
          orderBy: { enrollmentId: "asc" },
        },
        evidence: {
          where: { tenantId: context.tenantId },
          select: { id: true, originalFilename: true, status: true, scanStatus: true, byteSize: true, contentType: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ happenedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return { total, pageCount, page, entries };
  });
  return {
    classroom,
    enrollments,
    plans,
    selectedEnrollmentId: selectedEnrollment?.id ?? "",
    selectedPlanId: selectedPlan?.id ?? "",
    from: input.from && fromDate ? input.from : "",
    to: input.to && toDate ? input.to : "",
    ...result,
  };
}
