import { NextResponse, type NextRequest } from "next/server";
import { MembershipRole, NoticeVisibility } from "@/generated/prisma/client";
import { z } from "zod";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const schema = z.object({ classroomId: z.string().min(1), title: z.string().trim().min(3).max(160), body: z.string().trim().min(3).max(2000) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER]); }
  catch (error) { return new NextResponse(error instanceof ContextError ? error.message : "Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const form = await request.formData();
  const parsed = schema.safeParse({ classroomId: form.get("classroomId"), title: form.get("title"), body: form.get("body") });
  if (!parsed.success) return NextResponse.redirect(new URL(`/app/${escola}/comunicados?error=1`, request.url), 303);

  const classroomScope = context.role === MembershipRole.TEACHER
    ? { id: parsed.data.classroomId, tenantId: context.tenantId, staff: { some: { tenantId: context.tenantId, membershipId: context.membershipId } } }
    : { id: parsed.data.classroomId, tenantId: context.tenantId };
  const classroom = await prisma.classroom.findFirst({ where: classroomScope, select: { id: true } });
  if (!classroom) return new NextResponse("Turma não encontrada ou fora do seu escopo.", { status: 403 });
  await prisma.announcement.create({ data: {
    tenantId: context.tenantId,
    classroomId: classroom.id,
    title: parsed.data.title,
    body: parsed.data.body,
    visibility: NoticeVisibility.PUBLISHED,
    publishedAt: new Date(),
  } });
  return NextResponse.redirect(new URL(`/app/${escola}/comunicados?success=1`, request.url), 303);
}
