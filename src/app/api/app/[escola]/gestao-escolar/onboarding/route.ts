import { NextResponse, type NextRequest } from "next/server";
import { MembershipRole } from "@/generated/prisma/client";
import { z } from "zod";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const steps = ["school", "unit", "year", "classroom", "staff", "students", "guardians", "policies", "first-record"] as const;
const schema = z.object({ step: z.enum(steps), completed: z.enum(["true", "false"]) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR]); }
  catch (error) { return new NextResponse(error instanceof ContextError ? error.message : "Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const form = await request.formData();
  const parsed = schema.safeParse({ step: form.get("step"), completed: form.get("completed") });
  if (!parsed.success) return NextResponse.redirect(new URL(`/app/${escola}/gestao-escolar/onboarding?error=1`, request.url), 303);
  const completedAt = parsed.data.completed === "true" ? new Date() : null;
  await prisma.onboardingProgress.upsert({ where: { tenantId_step: { tenantId: context.tenantId, step: parsed.data.step } }, create: { tenantId: context.tenantId, updatedByMembershipId: context.membershipId, step: parsed.data.step, completedAt }, update: { updatedByMembershipId: context.membershipId, completedAt } });
  return NextResponse.redirect(new URL(`/app/${escola}/gestao-escolar/onboarding?saved=1`, request.url), 303);
}
