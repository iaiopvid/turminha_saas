import { NextResponse, type NextRequest } from "next/server";
import { MembershipRole } from "@/generated/prisma/client";
import { z } from "zod";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const schema = z.object({
  name: z.string().trim().min(2).max(140),
  displayClass: z.string().trim().min(2).max(100),
  displayTeam: z.string().trim().min(2).max(180),
  timezone: z.string().trim().min(1).max(80),
  publicStudents: z.enum(["true", "false"]),
  brandPrimary: z.string().regex(/^#[\da-fA-F]{6}$/),
  brandAccent: z.string().regex(/^#[\da-fA-F]{6}$/),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN]); }
  catch (error) { return new NextResponse(error instanceof ContextError ? error.message : "Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }

  const form = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(form.entries()));
  const destination = new URL(`/app/${encodeURIComponent(escola)}/configuracoes`, request.url);
  if (!parsed.success) { destination.searchParams.set("error", "invalid"); return NextResponse.redirect(destination, 303); }
  try { new Intl.DateTimeFormat("pt-BR", { timeZone: parsed.data.timezone }); }
  catch { destination.searchParams.set("error", "timezone"); return NextResponse.redirect(destination, 303); }

  const saved = await prisma.$transaction(async (tx) => {
    const admin = await tx.membership.findFirst({ where: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, role: MembershipRole.SCHOOL_ADMIN, status: "ACTIVE" }, select: { id: true } });
    if (!admin) return false;
    await tx.school.update({
      where: { tenantId: context.tenantId },
      data: {
        name: parsed.data.name,
        displayClass: parsed.data.displayClass,
        displayTeam: parsed.data.displayTeam,
        timezone: parsed.data.timezone,
        publicStudents: parsed.data.publicStudents === "true",
        brandPrimary: parsed.data.brandPrimary.toUpperCase(),
        brandAccent: parsed.data.brandAccent.toUpperCase(),
      },
    });
    return true;
  });
  if (!saved) return new NextResponse("A permissão administrativa foi revogada.", { status: 403 });
  destination.searchParams.set("saved", "1");
  return NextResponse.redirect(destination, 303);
}
