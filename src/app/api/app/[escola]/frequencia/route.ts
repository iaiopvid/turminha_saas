import { NextResponse, type NextRequest } from "next/server";
import { AttendanceStatus, EnrollmentStatus, MembershipRole } from "@/generated/prisma/client";
import { z } from "zod";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const statuses = new Set<string>(Object.values(AttendanceStatus));
const schema = z.object({ classroomId: z.string().min(1), classDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER]); }
  catch (error) { return new NextResponse(error instanceof ContextError ? error.message : "Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const form = await request.formData();
  const parsed = schema.safeParse({ classroomId: form.get("classroomId"), classDate: form.get("classDate") });
  if (!parsed.success) return new NextResponse("Dados inválidos.", { status: 400 });
  const classDate = new Date(`${parsed.data.classDate}T00:00:00.000Z`);
  if (Number.isNaN(classDate.getTime()) || classDate.toISOString().slice(0,10) !== parsed.data.classDate) return new NextResponse("Data inválida.", { status: 400 });

  const classroom = await prisma.classroom.findFirst({
    where: {
      id: parsed.data.classroomId,
      tenantId: context.tenantId,
      ...(context.role === MembershipRole.TEACHER ? { staff: { some: { tenantId: context.tenantId, membershipId: context.membershipId } } } : {}),
    },
    select: { id: true },
  });
  if (!classroom) return new NextResponse("Turma não encontrada ou fora do seu escopo.", { status: 403 });

  const requested = [...form.entries()].flatMap(([key, value]) => {
    if (!key.startsWith("status:") || typeof value !== "string" || !statuses.has(value)) return [];
    return [{ enrollmentId: key.slice(7), status: value as AttendanceStatus }];
  });
  if (requested.length > 100) return new NextResponse("Limite de registros excedido.", { status: 413 });
  const uniqueIds = [...new Set(requested.map((entry) => entry.enrollmentId))];
  const eligible = uniqueIds.length ? await prisma.enrollment.findMany({
    where: { tenantId: context.tenantId, classroomId: classroom.id, status: EnrollmentStatus.ACTIVE, id: { in: uniqueIds } },
    select: { id: true },
  }) : [];
  if (eligible.length !== uniqueIds.length) return new NextResponse("Um ou mais vínculos não pertencem à turma selecionada.", { status: 403 });

  await prisma.$transaction(requested.map((entry) => prisma.attendance.upsert({
    where: { tenantId_enrollmentId_classDate: { tenantId: context.tenantId, enrollmentId: entry.enrollmentId, classDate } },
    create: { tenantId: context.tenantId, enrollmentId: entry.enrollmentId, classDate, status: entry.status, recordedBy: context.membershipId },
    update: { status: entry.status, recordedBy: context.membershipId },
  })));
  return NextResponse.redirect(new URL(`/app/${escola}/frequencia?salva=1`, request.url), 303);
}
