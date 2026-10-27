import { NextResponse, type NextRequest } from "next/server";
import { EnrollmentStatus, MembershipRole } from "@/generated/prisma/client";
import { z } from "zod";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("school:update"), name: z.string().trim().min(2).max(140), displayClass: z.string().trim().min(2).max(100) }),
  z.object({ action: z.literal("unit:create"), name: z.string().trim().min(2).max(120) }),
  z.object({ action: z.literal("classroom:create"), name: z.string().trim().min(2).max(100), schoolYear: z.coerce.number().int().min(2000).max(2200), capacity: z.coerce.number().int().min(1).max(100), unitId: z.string().max(30).transform((value) => value || null) }),
  z.object({ action: z.literal("student:create"), displayName: z.string().trim().min(2).max(100), classroomId: z.string().min(1).max(30) }),
  z.object({ action: z.literal("staff:assign"), classroomId: z.string().min(1).max(30), membershipId: z.string().min(1).max(30) }),
  z.object({ action: z.literal("guardian:link"), studentId: z.string().min(1).max(30), membershipId: z.string().min(1).max(30) }),
]);

function back(request: NextRequest, escola: string, result: "saved" | "invalid" | "failed") {
  return NextResponse.redirect(new URL(`/app/${encodeURIComponent(escola)}/gestao-escolar?${result}=1`, request.url), 303);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola } = await params;
  let context;
  try {
    context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR]);
  } catch (error) {
    return new NextResponse(error instanceof ContextError ? error.message : "Acesso negado.", { status: error instanceof ContextError ? error.status : 403 });
  }

  const form = await request.formData();
  const raw = Object.fromEntries(form.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return back(request, escola, "invalid");
  const data = parsed.data;

  try {
    if (data.action === "school:update") {
      await prisma.school.update({ where: { tenantId: context.tenantId }, data: { name: data.name, displayClass: data.displayClass } });
    } else if (data.action === "unit:create") {
      await prisma.schoolUnit.create({ data: { tenantId: context.tenantId, name: data.name } });
    } else if (data.action === "classroom:create") {
      if (data.unitId) {
        const unit = await prisma.schoolUnit.findFirst({ where: { id: data.unitId, tenantId: context.tenantId, active: true }, select: { id: true } });
        if (!unit) return new NextResponse("Unidade não encontrada nesta escola.", { status: 403 });
      }
      await prisma.classroom.create({ data: { tenantId: context.tenantId, name: data.name, schoolYear: data.schoolYear, capacity: data.capacity, unitId: data.unitId, status: EnrollmentStatus.ACTIVE } });
    } else if (data.action === "student:create") {
      const result = await prisma.$transaction(async (tx) => {
        const classroom = await tx.classroom.findFirst({ where: { id: data.classroomId, tenantId: context.tenantId, status: EnrollmentStatus.ACTIVE }, select: { id: true, capacity: true } });
        if (!classroom) return "no-class" as const;
        const active = await tx.enrollment.count({ where: { tenantId: context.tenantId, classroomId: classroom.id, status: EnrollmentStatus.ACTIVE } });
        const student = await tx.student.create({ data: { tenantId: context.tenantId, displayName: data.displayName } });
        await tx.enrollment.create({ data: { tenantId: context.tenantId, studentId: student.id, classroomId: classroom.id, status: active >= classroom.capacity ? EnrollmentStatus.WAITLISTED : EnrollmentStatus.ACTIVE } });
        return active >= classroom.capacity ? "waitlisted" as const : "active" as const;
      }, { isolationLevel: "Serializable" });
      if (result === "no-class") return new NextResponse("Turma não encontrada nesta escola.", { status: 403 });
    } else if (data.action === "staff:assign") {
      const [classroom, member] = await Promise.all([
        prisma.classroom.findFirst({ where: { id: data.classroomId, tenantId: context.tenantId }, select: { id: true } }),
        prisma.membership.findFirst({ where: { id: data.membershipId, tenantId: context.tenantId, status: "ACTIVE", role: { in: [MembershipRole.TEACHER, MembershipRole.ASSISTANT] } }, select: { id: true } }),
      ]);
      if (!classroom || !member) return new NextResponse("Turma ou vínculo de equipe fora do escopo desta escola.", { status: 403 });
      await prisma.classroomStaff.upsert({ where: { tenantId_classroomId_membershipId: { tenantId: context.tenantId, classroomId: classroom.id, membershipId: member.id } }, create: { tenantId: context.tenantId, classroomId: classroom.id, membershipId: member.id }, update: {} });
    } else {
      const [student, guardian] = await Promise.all([
        prisma.student.findFirst({ where: { id: data.studentId, tenantId: context.tenantId }, select: { id: true } }),
        prisma.membership.findFirst({ where: { id: data.membershipId, tenantId: context.tenantId, status: "ACTIVE", role: MembershipRole.GUARDIAN }, select: { id: true } }),
      ]);
      if (!student || !guardian) return new NextResponse("Criança ou vínculo familiar fora do escopo desta escola.", { status: 403 });
      const currentLink = await prisma.studentGuardian.findUnique({ where: { tenantId_studentId_membershipId: { tenantId: context.tenantId, studentId: student.id, membershipId: guardian.id } }, select: { revokedAt: true } });
      if (currentLink && !currentLink.revokedAt) return back(request, escola, "saved");
      await prisma.studentGuardian.upsert({ where: { tenantId_studentId_membershipId: { tenantId: context.tenantId, studentId: student.id, membershipId: guardian.id } }, create: { tenantId: context.tenantId, studentId: student.id, membershipId: guardian.id, approved: false }, update: { approved: false, revokedAt: null } });
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return back(request, escola, "failed");
    return back(request, escola, "failed");
  }
  return back(request, escola, "saved");
}
