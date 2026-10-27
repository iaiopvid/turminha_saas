import { NextResponse, type NextRequest } from "next/server";
import { EnrollmentStatus, MembershipRole } from "@/generated/prisma/client";
import { z } from "zod";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const schema = z.object({ enrollmentId: z.string().min(1).max(30), toClassroomId: z.string().min(1).max(30), effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().max(500) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR]); }
  catch (error) { return new NextResponse(error instanceof ContextError ? error.message : "Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const form = await request.formData();
  const parsed = schema.safeParse({ enrollmentId: form.get("enrollmentId"), toClassroomId: form.get("toClassroomId"), effectiveOn: form.get("effectiveOn"), reason: form.get("reason") ?? "" });
  if (!parsed.success) return NextResponse.redirect(new URL(`/app/${escola}/gestao-escolar?invalid=1`, request.url), 303);
  const data = parsed.data;
  const effectiveOn = new Date(`${data.effectiveOn}T00:00:00.000Z`);
  if (Number.isNaN(effectiveOn.getTime()) || effectiveOn.toISOString().slice(0, 10) !== data.effectiveOn) return NextResponse.redirect(new URL(`/app/${escola}/gestao-escolar?invalid=1`, request.url), 303);
  const existing = await prisma.enrollmentTransfer.findFirst({ where: { tenantId: context.tenantId, fromEnrollmentId: data.enrollmentId }, select: { id: true } });
  if (existing) return NextResponse.redirect(new URL(`/app/${escola}/gestao-escolar?saved=1`, request.url), 303);
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.enrollment.findFirst({ where: { id: data.enrollmentId, tenantId: context.tenantId, status: EnrollmentStatus.ACTIVE }, select: { id: true, studentId: true, classroomId: true, validFrom: true } });
      const target = await tx.classroom.findFirst({ where: { id: data.toClassroomId, tenantId: context.tenantId, status: EnrollmentStatus.ACTIVE }, select: { id: true, capacity: true } });
      if (!current || !target) throw new Error("SCOPE");
      if (target.id === current.classroomId) throw new Error("DUPLICATE");
      if (effectiveOn < current.validFrom) throw new Error("DATE");
      const duplicate = await tx.enrollment.findFirst({ where: { tenantId: context.tenantId, studentId: current.studentId, classroomId: target.id } });
      if (duplicate) throw new Error("DUPLICATE");
      const activeCount = await tx.enrollment.count({ where: { tenantId: context.tenantId, classroomId: target.id, status: EnrollmentStatus.ACTIVE } });
      await tx.enrollment.update({ where: { tenantId_id: { tenantId: context.tenantId, id: current.id } }, data: { status: EnrollmentStatus.TRANSFERRED, validUntil: effectiveOn } });
      const next = await tx.enrollment.create({ data: { tenantId: context.tenantId, studentId: current.studentId, classroomId: target.id, status: activeCount >= target.capacity ? EnrollmentStatus.WAITLISTED : EnrollmentStatus.ACTIVE, validFrom: effectiveOn } });
      await tx.enrollmentTransfer.create({ data: { tenantId: context.tenantId, studentId: current.studentId, fromEnrollmentId: current.id, toEnrollmentId: next.id, recordedByMembershipId: context.membershipId, effectiveOn, reason: data.reason || null } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SCOPE") return new NextResponse("Matrícula ou turma fora do escopo desta escola.", { status: 403 });
    if (message === "DATE" || message === "DUPLICATE") return NextResponse.redirect(new URL(`/app/${escola}/gestao-escolar?invalid=1`, request.url), 303);
    return NextResponse.redirect(new URL(`/app/${escola}/gestao-escolar?failed=1`, request.url), 303);
  }
  return NextResponse.redirect(new URL(`/app/${escola}/gestao-escolar?saved=1`, request.url), 303);
}
