import "server-only";
import type { TenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

export async function getGuardianDashboard(context: TenantContext) {
  if (context.role !== "GUARDIAN") return null;
  const links = await prisma.studentGuardian.findMany({
    where: { tenantId: context.tenantId, membershipId: context.membershipId, approved: true, revokedAt: null },
    select: {
      student: {
        select: {
          id: true,
          displayName: true,
          enrollments: {
            where: { tenantId: context.tenantId, status: "ACTIVE" },
            select: { classroom: { select: { id: true, name: true } } },
            take: 4,
          },
        },
      },
    },
    orderBy: { student: { displayName: "asc" } },
  });
  const classrooms = [...new Set(links.flatMap((link) => link.student.enrollments.map((enrollment) => enrollment.classroom.id)))];
  const notices = await prisma.announcement.findMany({
    where: { tenantId: context.tenantId, visibility: "PUBLISHED", OR: [{ classroomId: null }, { classroomId: { in: classrooms } }] },
    select: { id: true, title: true, body: true, publishedAt: true },
    orderBy: { publishedAt: "desc" },
    take: 12,
  });
  return { students: links.map((link) => link.student), notices };
}
