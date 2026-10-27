import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { MembershipRole } from "@/generated/prisma/client";
import { z } from "zod";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const inviteSchema = z.object({
  role: z.enum([MembershipRole.GUARDIAN, MembershipRole.TEACHER, MembershipRole.ASSISTANT]),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  displayName: z.string().trim().min(2).max(100),
  studentId: z.string().max(30).nullable(),
  classroomId: z.string().max(30).nullable(),
}).superRefine((data, ctx) => {
  if (data.role === MembershipRole.GUARDIAN && (!data.studentId || data.classroomId)) ctx.addIssue({ code: "custom", message: "Responsável requer uma criança e não recebe turma diretamente." });
  if (data.role !== MembershipRole.GUARDIAN && (!data.classroomId || data.studentId)) ctx.addIssue({ code: "custom", message: "Equipe requer uma turma e não recebe vínculo infantil." });
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Requisição inválida." }, { status: 403 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 16_384) return NextResponse.json({ error: "Dados do convite excedem o limite." }, { status: 413 });
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR]); }
  catch (error) { return NextResponse.json({ error: error instanceof ContextError ? error.message : "Acesso negado." }, { status: error instanceof ContextError ? error.status : 403 }); }
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Informe o perfil, e-mail, nome e vínculo correspondente." }, { status: 400 });
  const data = parsed.data;

  const [student, classroom, existingUser] = await Promise.all([
    data.studentId ? prisma.student.findFirst({ where: { id: data.studentId, tenantId: context.tenantId }, select: { id: true } }) : null,
    data.classroomId ? prisma.classroom.findFirst({ where: { id: data.classroomId, tenantId: context.tenantId, status: "ACTIVE" }, select: { id: true } }) : null,
    prisma.user.findUnique({ where: { email: data.email }, select: { id: true } }),
  ]);
  if ((data.studentId && !student) || (data.classroomId && !classroom)) return NextResponse.json({ error: "O vínculo escolhido não pertence a esta escola." }, { status: 403 });
  if (existingUser) {
    const currentMembership = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: context.tenantId, userId: existingUser.id } }, select: { role: true, status: true } });
    if (currentMembership?.status === "ACTIVE" && currentMembership.role !== data.role) return NextResponse.json({ error: "Esta conta já possui outro perfil ativo nesta escola. A equipe precisa revisar esse vínculo antes de convidá-la." }, { status: 409 });
  }
  const pending = await prisma.invitation.findFirst({ where: { tenantId: context.tenantId, email: data.email, role: data.role, studentId: data.studentId, classroomId: data.classroomId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
  if (pending) return NextResponse.json({ error: "Já existe um convite ativo para esse e-mail e vínculo." }, { status: 409 });

  const token = randomBytes(32).toString("base64url");
  await prisma.invitation.create({ data: {
    tenantId: context.tenantId,
    createdByMembershipId: context.membershipId,
    email: data.email,
    displayName: data.displayName,
    role: data.role,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    studentId: student?.id ?? null,
    classroomId: classroom?.id ?? null,
  } });
  return NextResponse.json({ invitationUrl: `/convite/${token}`, expiresInDays: 7 }, { status: 201, headers: { "cache-control": "no-store" } });
}
