import { NextResponse, type NextRequest } from "next/server";
import { CalendarEntryKind, EnrollmentStatus, MembershipRole } from "@/generated/prisma/client";
import { z } from "zod";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("year:create"), year: z.coerce.number().int().min(2000).max(2200), startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ action: z.literal("year:close"), schoolYearId: z.string().min(1).max(30) }),
  z.object({ action: z.literal("year:rollover"), sourceYearId: z.string().min(1).max(30), year: z.coerce.number().int().min(2000).max(2200), startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), classroomIds: z.array(z.string().min(1).max(30)).max(100), staffAssignments: z.array(z.object({ classroomId: z.string().min(1).max(30), membershipId: z.string().min(1).max(30) })).max(100), carryStudents: z.enum(["true", "false"]), confirm: z.literal("yes") }),
  z.object({ action: z.literal("entry:create"), schoolYearId: z.string().min(1).max(30), kind: z.nativeEnum(CalendarEntryKind), title: z.string().trim().min(2).max(140), startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ action: z.literal("entry:archive"), entryId: z.string().min(1).max(30) }),
]);

function dateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
function result(request: NextRequest, escola: string, key: string) { return NextResponse.redirect(new URL(`/app/${encodeURIComponent(escola)}/calendario?${key}=1`, request.url), 303); }

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR]); }
  catch (error) { return new NextResponse(error instanceof ContextError ? error.message : "Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const form = await request.formData();
  const raw: Record<string, unknown> = Object.fromEntries(form.entries());
  if (raw.action === "year:rollover") {
    raw.classroomIds = form.getAll("classroomId").filter((value): value is string => typeof value === "string");
    raw.staffAssignments = [...form.entries()].filter(([key, value]) => key.startsWith("staff:") && typeof value === "string" && value).map(([key, value]) => ({ classroomId: key.slice(6), membershipId: value }));
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return result(request, escola, "invalid");
  try {
    if (parsed.data.action === "year:create") {
      const startsOn = dateOnly(parsed.data.startsOn); const endsOn = dateOnly(parsed.data.endsOn);
      if (!startsOn || !endsOn || startsOn > endsOn) return result(request, escola, "invalid");
      await prisma.schoolYear.create({ data: { tenantId: context.tenantId, year: parsed.data.year, startsOn, endsOn } });
    } else if (parsed.data.action === "year:close") {
      const year = await prisma.schoolYear.findFirst({ where: { id: parsed.data.schoolYearId, tenantId: context.tenantId, closedAt: null }, select: { id: true, year: true } });
      if (!year) return new NextResponse("Ano letivo fora do escopo ou já encerrado.", { status: 404 });
      const active = await prisma.enrollment.count({ where: { tenantId: context.tenantId, classroom: { schoolYear: year.year }, status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.WAITLISTED] }, validUntil: null } });
      if (active) return result(request, escola, "rolloverRequired");
      await prisma.$transaction([
        prisma.classroom.updateMany({ where: { tenantId: context.tenantId, schoolYear: year.year, status: EnrollmentStatus.ACTIVE }, data: { status: EnrollmentStatus.FINISHED } }),
        prisma.schoolYear.update({ where: { tenantId_id: { tenantId: context.tenantId, id: year.id } }, data: { closedAt: new Date() } }),
      ]);
    } else if (parsed.data.action === "year:rollover") {
      const data = parsed.data;
      const startsOn = dateOnly(data.startsOn); const endsOn = dateOnly(data.endsOn);
      if (!startsOn || !endsOn || startsOn > endsOn || !data.classroomIds.length || new Set(data.classroomIds).size !== data.classroomIds.length) return result(request, escola, "invalid");
      const summary = await prisma.$transaction(async (tx) => {
        const source = await tx.schoolYear.findFirst({ where: { id: data.sourceYearId, tenantId: context.tenantId, closedAt: null }, select: { id: true, year: true, endsOn: true } });
        if (!source || data.year <= source.year || startsOn <= source.endsOn) throw new Error("ROLLOVER_DATES");
        if (await tx.schoolYear.findFirst({ where: { tenantId: context.tenantId, year: data.year }, select: { id: true } })) throw new Error("ROLLOVER_DUPLICATE_YEAR");
        const sourceClasses = await tx.classroom.findMany({ where: { tenantId: context.tenantId, schoolYear: source.year, id: { in: data.classroomIds }, status: EnrollmentStatus.ACTIVE }, select: { id: true, name: true, capacity: true, unitId: true } });
        if (sourceClasses.length !== data.classroomIds.length) throw new Error("ROLLOVER_SCOPE");
        const assignments = data.staffAssignments.filter((item) => data.classroomIds.includes(item.classroomId));
        if (new Set(assignments.map((item) => item.classroomId)).size !== assignments.length) throw new Error("ROLLOVER_STAFF");
        const staffIds = assignments.map((item) => item.membershipId);
        const staff = staffIds.length ? await tx.membership.findMany({ where: { tenantId: context.tenantId, id: { in: staffIds }, status: "ACTIVE", role: { in: [MembershipRole.TEACHER, MembershipRole.ASSISTANT] } }, select: { id: true } }) : [];
        if (staff.length !== staffIds.length) throw new Error("ROLLOVER_STAFF");
        const existingTarget = await tx.classroom.findMany({ where: { tenantId: context.tenantId, schoolYear: data.year, name: { in: sourceClasses.map((item) => item.name) } }, select: { id: true } });
        if (existingTarget.length) throw new Error("ROLLOVER_DUPLICATE_CLASS");
        const targetYear = await tx.schoolYear.create({ data: { tenantId: context.tenantId, year: data.year, startsOn, endsOn } });
        const activeUnits = [...new Set(sourceClasses.map((item) => item.unitId).filter((id): id is string => !!id))];
        const validUnits = activeUnits.length ? await tx.schoolUnit.findMany({ where: { tenantId: context.tenantId, id: { in: activeUnits }, active: true }, select: { id: true } }) : [];
        const validUnitIds = new Set(validUnits.map((item) => item.id));
        const targetBySourceClass = new Map<string, string>();
        for (const sourceClass of sourceClasses) {
          const target = await tx.classroom.create({ data: { tenantId: context.tenantId, schoolYear: data.year, name: sourceClass.name, capacity: sourceClass.capacity, unitId: sourceClass.unitId && validUnitIds.has(sourceClass.unitId) ? sourceClass.unitId : null } });
          targetBySourceClass.set(sourceClass.id, target.id);
          const assignment = assignments.find((item) => item.classroomId === sourceClass.id);
          if (assignment) await tx.classroomStaff.create({ data: { tenantId: context.tenantId, classroomId: target.id, membershipId: assignment.membershipId } });
        }
        const sourceEnrollments = await tx.enrollment.findMany({ where: { tenantId: context.tenantId, classroom: { schoolYear: source.year }, status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.WAITLISTED] }, validUntil: null }, select: { id: true, studentId: true, classroomId: true, status: true, validFrom: true }, orderBy: [{ classroomId: "asc" }, { validFrom: "asc" }, { id: "asc" }] });
        const moving = data.carryStudents === "true" ? sourceEnrollments.filter((item) => data.classroomIds.includes(item.classroomId)) : [];
        const movedStudents = new Set(moving.map((item) => item.studentId));
        if (moving.some((item) => sourceEnrollments.some((other) => other.studentId === item.studentId && !data.classroomIds.includes(other.classroomId)))) throw new Error("ROLLOVER_SELECT_ALL");
        const otherActiveEnrollments = movedStudents.size ? await tx.enrollment.findMany({ where: { tenantId: context.tenantId, studentId: { in: [...movedStudents] }, status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.WAITLISTED] }, validUntil: null }, select: { classroomId: true, classroom: { select: { schoolYear: true } } } }) : [];
        if (otherActiveEnrollments.some((item) => item.classroom.schoolYear !== source.year || !data.classroomIds.includes(item.classroomId))) throw new Error("ROLLOVER_SELECT_ALL");
        await tx.enrollment.updateMany({ where: { tenantId: context.tenantId, id: { in: sourceEnrollments.map((item) => item.id) } }, data: { status: EnrollmentStatus.FINISHED, validUntil: source.endsOn } });
        const classCounts = new Map<string, number>();
        const capacityBySource = new Map(sourceClasses.map((item) => [item.id, item.capacity]));
        for (const oldEnrollment of moving) {
          const targetClassroomId = targetBySourceClass.get(oldEnrollment.classroomId)!;
          const currentCount = classCounts.get(oldEnrollment.classroomId) ?? 0;
          const targetStatus = oldEnrollment.status === EnrollmentStatus.WAITLISTED || currentCount >= (capacityBySource.get(oldEnrollment.classroomId) ?? 0) ? EnrollmentStatus.WAITLISTED : EnrollmentStatus.ACTIVE;
          const nextEnrollment = await tx.enrollment.create({ data: { tenantId: context.tenantId, studentId: oldEnrollment.studentId, classroomId: targetClassroomId, status: targetStatus, validFrom: startsOn } });
          if (targetStatus === EnrollmentStatus.ACTIVE) classCounts.set(oldEnrollment.classroomId, currentCount + 1);
          await tx.enrollmentTransfer.create({ data: { tenantId: context.tenantId, studentId: oldEnrollment.studentId, fromEnrollmentId: oldEnrollment.id, toEnrollmentId: nextEnrollment.id, recordedByMembershipId: context.membershipId, effectiveOn: startsOn, reason: `Virada do ano letivo ${source.year} para ${data.year}` } });
        }
        await tx.classroom.updateMany({ where: { tenantId: context.tenantId, schoolYear: source.year, status: EnrollmentStatus.ACTIVE }, data: { status: EnrollmentStatus.FINISHED } });
        await tx.schoolYear.update({ where: { tenantId_id: { tenantId: context.tenantId, id: source.id } }, data: { closedAt: new Date() } });
        return { yearId: targetYear.id, classCount: sourceClasses.length, transferredStudents: movedStudents.size };
      }, { isolationLevel: "Serializable" });
      return NextResponse.redirect(new URL(`/app/${encodeURIComponent(escola)}/calendario?saved=1&rollover=${summary.transferredStudents}`, request.url), 303);
    } else if (parsed.data.action === "entry:create") {
      const startsOn = dateOnly(parsed.data.startsOn); const endsOn = dateOnly(parsed.data.endsOn);
      const schoolYear = await prisma.schoolYear.findFirst({ where: { id: parsed.data.schoolYearId, tenantId: context.tenantId, closedAt: null }, select: { id: true, startsOn: true, endsOn: true } });
      if (!startsOn || !endsOn || startsOn > endsOn || !schoolYear || startsOn < schoolYear.startsOn || endsOn > schoolYear.endsOn) return result(request, escola, "invalid");
      await prisma.calendarEntry.create({ data: { tenantId: context.tenantId, schoolYearId: schoolYear.id, createdByMembershipId: context.membershipId, kind: parsed.data.kind, title: parsed.data.title, startsOn, endsOn } });
    } else {
      const archived = await prisma.calendarEntry.updateMany({ where: { id: parsed.data.entryId, tenantId: context.tenantId, archivedAt: null }, data: { archivedAt: new Date() } });
      if (!archived.count) return new NextResponse("Evento fora do escopo ou já arquivado.", { status: 404 });
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ROLLOVER_")) {
      const key = error.message === "ROLLOVER_DUPLICATE_YEAR" || error.message === "ROLLOVER_DUPLICATE_CLASS" ? "duplicate" : error.message === "ROLLOVER_SCOPE" ? "invalid" : "failed";
      return result(request, escola, key);
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return result(request, escola, "duplicate");
    return result(request, escola, "failed");
  }
  return result(request, escola, "saved");
}
