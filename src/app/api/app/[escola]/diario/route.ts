import { NextResponse, type NextRequest } from "next/server";
import { AttendanceStatus, EnrollmentStatus, JournalEntryStatus, MembershipRole, MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const schema = z.object({
  classroomId: z.string().min(1).max(30),
  idempotencyKey: z.string().uuid(),
  happenedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(5000),
  materials: z.string().trim().max(1000),
  learningPlanId: z.string().max(30).nullable(),
});

const roles = [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT];

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, roles); }
  catch (error) { return new NextResponse(error instanceof ContextError ? error.message : "Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }

  const form = await request.formData();
  const parsed = schema.safeParse({
    classroomId: form.get("classroomId"),
    idempotencyKey: form.get("idempotencyKey"),
    happenedAt: form.get("happenedAt"),
    title: form.get("title"),
    description: form.get("description"),
    materials: form.get("materials") ?? "",
    learningPlanId: form.get("learningPlanId") === "" || form.get("learningPlanId") === null ? null : form.get("learningPlanId"),
  });
  const classroomId = typeof form.get("classroomId") === "string" ? String(form.get("classroomId")) : "";
  const returnTo = new URL(`/app/${encodeURIComponent(escola)}/diario?classroomId=${encodeURIComponent(classroomId)}`, request.url);
  if (!parsed.success) { returnTo.searchParams.set("error", "invalid"); return NextResponse.redirect(returnTo, 303); }

  const classDate = new Date(`${parsed.data.happenedAt}T00:00:00.000Z`);
  if (Number.isNaN(classDate.getTime()) || classDate.toISOString().slice(0, 10) !== parsed.data.happenedAt) {
    returnTo.searchParams.set("error", "invalid-date");
    return NextResponse.redirect(returnTo, 303);
  }

  const requestedEnrollmentIds = form.getAll("participantEnrollmentId").filter((value): value is string => typeof value === "string");
  const enrollmentIds = [...new Set(requestedEnrollmentIds)];
  if (enrollmentIds.length === 0 || enrollmentIds.length > 100 || enrollmentIds.some((id) => id.length > 30)) {
    returnTo.searchParams.set("error", "participants");
    return NextResponse.redirect(returnTo, 303);
  }
  const selectedIds = new Set(enrollmentIds);
  const observations = new Map<string, string>();
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("observation:")) continue;
    const enrollmentId = key.slice("observation:".length);
    if (typeof value !== "string" || value.trim().length > 1000) {
      returnTo.searchParams.set("error", "observations");
      return NextResponse.redirect(returnTo, 303);
    }
    if (value.trim()) {
      if (!selectedIds.has(enrollmentId)) {
        returnTo.searchParams.set("error", "observations");
        return NextResponse.redirect(returnTo, 303);
      }
      observations.set(enrollmentId, value.trim());
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const activeMembership = await tx.membership.findFirst({
        where: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, status: MembershipStatus.ACTIVE, role: { in: roles } },
        select: { id: true },
      });
      if (!activeMembership) throw new Error("ACCESS_REVOKED");
      const classroom = await tx.classroom.findFirst({
        where: {
          id: parsed.data.classroomId,
          tenantId: context.tenantId,
          status: EnrollmentStatus.ACTIVE,
          ...(context.role === MembershipRole.SCHOOL_ADMIN || context.role === MembershipRole.COORDINATOR
            ? {}
            : { staff: { some: { tenantId: context.tenantId, membershipId: activeMembership.id } } }),
        },
        select: { id: true },
      });
      if (!classroom) throw new Error("CLASSROOM_FORBIDDEN");

      if (parsed.data.learningPlanId) {
        const approvedPlan = await tx.learningPlan.findFirst({
          where: { id: parsed.data.learningPlanId, tenantId: context.tenantId, classroomId: classroom.id, status: "APPROVED" },
          select: { id: true },
        });
        if (!approvedPlan) throw new Error("PLAN_FORBIDDEN");
      }

      const previous = await tx.journalEntry.findFirst({
        where: { tenantId: context.tenantId, authorMembershipId: activeMembership.id, idempotencyKey: parsed.data.idempotencyKey },
        select: { classroomId: true, learningPlanId: true, happenedAt: true, title: true, description: true, materials: true, participants: { select: { enrollmentId: true, observation: true } } },
      });
      if (previous) {
        const sameParticipants = previous.participants.map((item) => item.enrollmentId).sort().join(",") === [...enrollmentIds].sort().join(",");
        const sameObservations = previous.participants.every((item) => (item.observation ?? "") === (observations.get(item.enrollmentId) ?? ""));
        if (previous.classroomId !== classroom.id || previous.learningPlanId !== parsed.data.learningPlanId || previous.happenedAt.getTime() !== classDate.getTime() || previous.title !== parsed.data.title || previous.description !== parsed.data.description || previous.materials !== (parsed.data.materials || null) || !sameParticipants || !sameObservations) throw new Error("IDEMPOTENCY_CONFLICT");
        return;
      }

      const enrollments = await tx.enrollment.findMany({
        where: {
          tenantId: context.tenantId,
          classroomId: classroom.id,
          status: EnrollmentStatus.ACTIVE,
          id: { in: enrollmentIds },
          attendance: { none: { tenantId: context.tenantId, classDate, status: { in: [AttendanceStatus.ABSENT, AttendanceStatus.EXCUSED] } } },
        },
        select: { id: true },
      });
      if (enrollments.length !== enrollmentIds.length) throw new Error("PARTICIPANT_FORBIDDEN");

      const entry = await tx.journalEntry.create({
        data: {
          tenantId: context.tenantId,
          classroomId: classroom.id,
          authorMembershipId: activeMembership.id,
          idempotencyKey: parsed.data.idempotencyKey,
          happenedAt: classDate,
          title: parsed.data.title,
          description: parsed.data.description,
          materials: parsed.data.materials || null,
          learningPlanId: parsed.data.learningPlanId,
          status: JournalEntryStatus.RECORDED,
        },
      });
      await tx.journalParticipant.createMany({
        data: enrollmentIds.map((enrollmentId) => ({ tenantId: context.tenantId, journalEntryId: entry.id, enrollmentId, observation: observations.get(enrollmentId) ?? null })),
      });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const replay = await prisma.journalEntry.findFirst({
        where: { tenantId: context.tenantId, authorMembershipId: context.membershipId, idempotencyKey: parsed.data.idempotencyKey },
        select: { classroomId: true, learningPlanId: true, happenedAt: true, title: true, description: true, materials: true, participants: { select: { enrollmentId: true, observation: true } } },
      });
      const sameObservations = replay?.participants.every((item) => (item.observation ?? "") === (observations.get(item.enrollmentId) ?? ""));
      if (replay && replay.classroomId === parsed.data.classroomId && replay.learningPlanId === parsed.data.learningPlanId && replay.happenedAt.getTime() === classDate.getTime() && replay.title === parsed.data.title && replay.description === parsed.data.description && replay.materials === (parsed.data.materials || null) && replay.participants.map((item) => item.enrollmentId).sort().join(",") === [...enrollmentIds].sort().join(",") && sameObservations) {
        returnTo.searchParams.set("saved", "1");
        return NextResponse.redirect(returnTo, 303);
      }
    }
    returnTo.searchParams.set("error", message === "CLASSROOM_FORBIDDEN" || message === "ACCESS_REVOKED" ? "scope" : message === "PARTICIPANT_FORBIDDEN" ? "participant-scope" : message === "PLAN_FORBIDDEN" ? "plan-scope" : "save");
    return NextResponse.redirect(returnTo, 303);
  }

  returnTo.searchParams.set("saved", "1");
  return NextResponse.redirect(returnTo, 303);
}
