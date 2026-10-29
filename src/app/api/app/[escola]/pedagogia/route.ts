import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { EnrollmentStatus, LearningPlanStatus, MembershipRole, MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const fields = {
  classroomId: z.string().min(1).max(30),
  title: z.string().trim().min(3).max(160),
  ageGroup: z.string().trim().min(2).max(80),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.union([z.literal(""), z.coerce.number().int().min(5).max(480)]),
  materials: z.string().trim().max(1000),
  intentions: z.string().trim().min(10).max(5000),
};
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...fields }),
  z.object({ action: z.literal("revise"), previousPlanId: z.string().min(1).max(30), ...fields }),
  z.object({ action: z.literal("submit"), planId: z.string().min(1).max(30) }),
  z.object({ action: z.literal("decide"), planId: z.string().min(1).max(30), decision: z.enum(["approve", "request_changes"]), reviewComment: z.string().trim().max(1000) }),
]);
const roles = [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER];
const managementRoles = [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR];

function go(request: NextRequest, escola: string, query: Record<string, string>) {
  const url = new URL(`/app/${encodeURIComponent(escola)}/pedagogia`, request.url);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, roles); }
  catch (error) { return new NextResponse(error instanceof ContextError ? error.message : "Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const form = await request.formData();
  const raw = Object.fromEntries(form.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return go(request, escola, { error: "invalid" });
  const input = parsed.data;

  try {
    if (input.action === "decide") {
      if (context.role !== MembershipRole.SCHOOL_ADMIN && context.role !== MembershipRole.COORDINATOR) return new NextResponse("Apenas coordenação ou direção pode revisar planos.", { status: 403 });
      if (input.decision === "request_changes" && input.reviewComment.length < 3) return go(request, escola, { error: "comment" });
      await prisma.$transaction(async (tx) => {
        const reviewer = await tx.membership.findFirst({ where: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, status: MembershipStatus.ACTIVE, role: { in: managementRoles } }, select: { id: true } });
        const plan = await tx.learningPlan.findFirst({
          where: { id: input.planId, tenantId: context.tenantId, status: LearningPlanStatus.SUBMITTED, ...(reviewer ? {} : { id: "" }) },
          select: { id: true, threadId: true, classroomId: true, authorMembershipId: true },
        });
        if (!reviewer || !plan || plan.authorMembershipId === reviewer.id) throw new Error("PLAN_REVIEW_FORBIDDEN");
        const latest = await tx.learningPlan.findFirst({ where: { tenantId: context.tenantId, threadId: plan.threadId }, orderBy: { version: "desc" }, select: { id: true } });
        if (latest?.id !== plan.id) throw new Error("PLAN_NOT_LATEST");
        await tx.learningPlan.update({
          where: { tenantId_id: { tenantId: context.tenantId, id: plan.id } },
          data: { status: input.decision === "approve" ? LearningPlanStatus.APPROVED : LearningPlanStatus.CHANGES_REQUESTED, reviewComment: input.reviewComment || null, reviewerMembershipId: reviewer.id, reviewedAt: new Date() },
        });
      });
      return go(request, escola, { saved: input.decision === "approve" ? "approved" : "returned" });
    }

    if (input.action === "submit") {
      await prisma.$transaction(async (tx) => {
        const author = await tx.membership.findFirst({ where: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, status: MembershipStatus.ACTIVE, role: { in: roles } }, select: { id: true } });
        const plan = await tx.learningPlan.findFirst({ where: { id: input.planId, tenantId: context.tenantId, authorMembershipId: context.membershipId, status: LearningPlanStatus.DRAFT }, select: { id: true, classroomId: true, threadId: true } });
        if (!author || !plan) throw new Error("PLAN_SUBMIT_FORBIDDEN");
        const classroom = await tx.classroom.findFirst({ where: { id: plan.classroomId, tenantId: context.tenantId, status: EnrollmentStatus.ACTIVE, ...(context.role === MembershipRole.SCHOOL_ADMIN || context.role === MembershipRole.COORDINATOR ? {} : { staff: { some: { tenantId: context.tenantId, membershipId: author.id } } }) }, select: { id: true } });
        const latest = await tx.learningPlan.findFirst({ where: { tenantId: context.tenantId, threadId: plan.threadId }, orderBy: { version: "desc" }, select: { id: true } });
        if (!classroom || latest?.id !== plan.id) throw new Error("PLAN_SUBMIT_FORBIDDEN");
        await tx.learningPlan.update({ where: { tenantId_id: { tenantId: context.tenantId, id: plan.id } }, data: { status: LearningPlanStatus.SUBMITTED, reviewComment: null, reviewerMembershipId: null, reviewedAt: null } });
      });
      return go(request, escola, { saved: "submitted" });
    }

    const start = new Date(`${input.periodStart}T00:00:00.000Z`);
    const end = new Date(`${input.periodEnd}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return go(request, escola, { error: "period" });
    if (input.action === "revise") {
      if (context.role === MembershipRole.SCHOOL_ADMIN || context.role === MembershipRole.COORDINATOR) return new NextResponse("Somente o autor pode criar uma revisão deste plano.", { status: 403 });
      const id = randomUUID().replaceAll("-", "").slice(0, 30);
      await prisma.$transaction(async (tx) => {
        const author = await tx.membership.findFirst({ where: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, status: MembershipStatus.ACTIVE, role: MembershipRole.TEACHER }, select: { id: true } });
        const source = await tx.learningPlan.findFirst({ where: { id: input.previousPlanId, tenantId: context.tenantId, authorMembershipId: context.membershipId, status: LearningPlanStatus.CHANGES_REQUESTED }, select: { id: true, threadId: true, version: true, classroomId: true } });
        if (!author || !source) throw new Error("PLAN_REVISE_FORBIDDEN");
        const latest = await tx.learningPlan.findFirst({ where: { tenantId: context.tenantId, threadId: source.threadId }, orderBy: { version: "desc" }, select: { id: true } });
        const classroom = await tx.classroom.findFirst({ where: { id: source.classroomId, tenantId: context.tenantId, status: EnrollmentStatus.ACTIVE, staff: { some: { tenantId: context.tenantId, membershipId: author.id } } }, select: { id: true } });
        if (!classroom || latest?.id !== source.id) throw new Error("PLAN_REVISE_FORBIDDEN");
        await tx.learningPlan.create({ data: { id, tenantId: context.tenantId, classroomId: classroom.id, authorMembershipId: author.id, threadId: source.threadId, supersedesId: source.id, version: source.version + 1, title: input.title, ageGroup: input.ageGroup, periodStart: start, periodEnd: end, durationMinutes: input.durationMinutes === "" ? null : input.durationMinutes, materials: input.materials || null, intentions: input.intentions, status: LearningPlanStatus.DRAFT } });
      }, { isolationLevel: "Serializable" });
      return go(request, escola, { saved: "revision" });
    }

    const id = randomUUID().replaceAll("-", "").slice(0, 30);
    await prisma.$transaction(async (tx) => {
      const author = await tx.membership.findFirst({ where: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, status: MembershipStatus.ACTIVE, role: { in: roles } }, select: { id: true } });
      const classroom = await tx.classroom.findFirst({ where: { id: input.classroomId, tenantId: context.tenantId, status: EnrollmentStatus.ACTIVE, ...(context.role === MembershipRole.SCHOOL_ADMIN || context.role === MembershipRole.COORDINATOR ? {} : { staff: { some: { tenantId: context.tenantId, membershipId: context.membershipId } } }) }, select: { id: true } });
      if (!author || !classroom) throw new Error("PLAN_CREATE_FORBIDDEN");
      await tx.learningPlan.create({ data: { id, tenantId: context.tenantId, classroomId: classroom.id, authorMembershipId: author.id, threadId: id, title: input.title, ageGroup: input.ageGroup, periodStart: start, periodEnd: end, durationMinutes: input.durationMinutes === "" ? null : input.durationMinutes, materials: input.materials || null, intentions: input.intentions } });
    }, { isolationLevel: "Serializable" });
    return go(request, escola, { saved: "draft" });
  } catch (error) {
    if (error instanceof Error && ["PLAN_REVIEW_FORBIDDEN", "PLAN_SUBMIT_FORBIDDEN", "PLAN_REVISE_FORBIDDEN", "PLAN_CREATE_FORBIDDEN"].includes(error.message)) return new NextResponse("Plano fora do escopo autorizado.", { status: 403 });
    return go(request, escola, { error: "save" });
  }
}
