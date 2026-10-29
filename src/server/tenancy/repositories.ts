import "server-only";
import { AttendanceStatus, EnrollmentStatus, MediaSubmissionStatus, MembershipRole, NoticeVisibility } from "@/generated/prisma/client";
import type { TenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

export async function listAuthorizedClassrooms(context: TenantContext) {
  const scope = context.role === MembershipRole.SCHOOL_ADMIN || context.role === MembershipRole.COORDINATOR
    ? { tenantId: context.tenantId }
    : { tenantId: context.tenantId, staff: { some: { tenantId: context.tenantId, membershipId: context.membershipId } } };
  return prisma.classroom.findMany({
    where: { ...scope, status: EnrollmentStatus.ACTIVE },
    select: { id: true, name: true, schoolYear: true },
    orderBy: [{ schoolYear: "desc" }, { name: "asc" }],
  });
}

export async function getTeacherDashboard(context: TenantContext, classroomId?: string) {
  const allowed: MembershipRole[] = [MembershipRole.TEACHER, MembershipRole.ASSISTANT, MembershipRole.COORDINATOR, MembershipRole.SCHOOL_ADMIN];
  if (!allowed.includes(context.role)) {
    return null;
  }
  const classes = await listAuthorizedClassrooms(context);
  const selected = classroomId ? classes.find((classroom) => classroom.id === classroomId) : classes[0];
  if (classroomId && !selected) return null;
  if (!selected) return { classroom: null, classrooms: classes, students: [], metrics: { students: 0, present: 0, absent: 0, marked: 0, pending: 0, photosToday: 0, dayOff: null }, notice: null };

  const classDate = new Intl.DateTimeFormat("en-CA", { timeZone: context.timezone }).format(new Date());
  const dateStart = new Date(`${classDate}T00:00:00.000Z`);
  const dateEnd = new Date(`${classDate}T23:59:59.999Z`);
  const [enrollmentCount, enrollments, attendance, photosToday, notice, schoolYear] = await Promise.all([
    prisma.enrollment.count({ where: { tenantId: context.tenantId, classroomId: selected.id, status: EnrollmentStatus.ACTIVE } }),
    prisma.enrollment.findMany({
      where: { tenantId: context.tenantId, classroomId: selected.id, status: EnrollmentStatus.ACTIVE },
      select: { id: true, student: { select: { id: true, displayName: true } } },
      orderBy: { student: { displayName: "asc" } },
      take: 100,
    }),
    prisma.attendance.findMany({
      where: { tenantId: context.tenantId, classDate: { gte: dateStart, lte: dateEnd }, enrollment: { tenantId: context.tenantId, classroomId: selected.id, status: EnrollmentStatus.ACTIVE } },
      select: { enrollmentId: true, status: true },
    }),
    prisma.mediaAsset.count({
      where: {
        tenantId: context.tenantId, createdAt: { gte: dateStart, lte: dateEnd }, scanStatus: "CLEAN", storageKey: { not: null }, contentType: { startsWith: "image/" },
        OR: [
          { classroomId: selected.id, status: { in: ["PENDING", "PUBLISHED", "AVAILABLE"] } },
          {
            classroomId: null, status: "PRIVATE",
            consents: { some: { tenantId: context.tenantId, purpose: "SCHOOL_REVIEW", revokedAt: null } },
            submissions: { some: {
              tenantId: context.tenantId, status: MediaSubmissionStatus.APPROVED,
              student: { enrollments: { some: { tenantId: context.tenantId, classroomId: selected.id, status: EnrollmentStatus.ACTIVE } } },
              submittedBy: { guardianLinks: { some: { tenantId: context.tenantId, approved: true, revokedAt: null } } },
            } },
          },
        ],
      },
    }),
    prisma.announcement.findFirst({
      where: { tenantId: context.tenantId, classroomId: selected.id, visibility: NoticeVisibility.PUBLISHED },
      select: { title: true, body: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.schoolYear.findFirst({ where: { tenantId: context.tenantId, year: selected.schoolYear }, select: { id: true } }),
  ]);
  const dayOff = schoolYear ? await prisma.calendarEntry.findFirst({
    where: { tenantId: context.tenantId, schoolYearId: schoolYear.id, kind: { in: ["HOLIDAY", "RECESS"] }, archivedAt: null, startsOn: { lte: dateStart }, endsOn: { gte: dateStart } },
    select: { title: true, kind: true },
    orderBy: [{ startsOn: "asc" }, { id: "asc" }],
  }) : null;
  const byEnrollment = new Map(attendance.map((entry) => [entry.enrollmentId, entry.status]));
  const students = enrollments.map((enrollment) => ({
    id: enrollment.student.id,
    name: enrollment.student.displayName,
    status: byEnrollment.get(enrollment.id) ?? null,
  }));
  const present = attendance.filter((entry) => entry.status === AttendanceStatus.PRESENT || entry.status === AttendanceStatus.LATE).length;
  const absent = attendance.filter((entry) => entry.status === AttendanceStatus.ABSENT || entry.status === AttendanceStatus.EXCUSED).length;
  return {
    classroom: selected,
    classrooms: classes,
    students,
    notice,
    metrics: { students: enrollmentCount, present, absent, marked: attendance.length, pending: Math.max(0, enrollmentCount - attendance.length), photosToday, dayOff },
  };
}

export async function getPublicClassroom(slug: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { slug, status: "ACTIVE" },
    select: {
      id: true,
      slug: true,
      school: { select: { name: true, displayClass: true, displayTeam: true, timezone: true, publicStudents: true } },
      classrooms: {
        where: { status: EnrollmentStatus.ACTIVE },
        select: { id: true, name: true, schoolYear: true },
        orderBy: [{ schoolYear: "desc" }, { name: "asc" }],
        take: 1,
      },
    },
  });
  if (!tenant?.school) return null;
  const classroom = tenant.classrooms[0] ?? null;
  const [studentCount, gallery, notices] = await Promise.all([
    classroom && tenant.school.publicStudents ? prisma.enrollment.count({ where: { tenantId: tenant.id, classroomId: classroom.id, status: EnrollmentStatus.ACTIVE } }) : null,
    classroom ? prisma.mediaAsset.findMany({
      where: { tenantId: tenant.id, classroomId: classroom.id, status: "AVAILABLE", publishedAt: { not: null } },
      select: { id: true, title: true, category: true, publishedAt: true },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 12,
    }) : [],
    prisma.announcement.findMany({
      where: { tenantId: tenant.id, visibility: NoticeVisibility.PUBLISHED, OR: classroom ? [{ classroomId: null }, { classroomId: classroom.id }] : [{ classroomId: null }] },
      select: { id: true, title: true, body: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
      take: 1,
    }),
  ]);
  return { ...tenant, classroom, studentCount, gallery, notices };
}
