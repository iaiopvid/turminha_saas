import { NextResponse, type NextRequest } from "next/server";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ escola: string; inviteId: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Requisição inválida." }, { status: 403 });
  const { escola, inviteId } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR]); }
  catch (error) { return NextResponse.json({ error: error instanceof ContextError ? error.message : "Acesso negado." }, { status: error instanceof ContextError ? error.status : 403 }); }
  const result = await prisma.invitation.updateMany({ where: { id: inviteId, tenantId: context.tenantId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  return result.count === 1 ? NextResponse.json({ revoked: true }) : NextResponse.json({ error: "Convite não encontrado, já aceito ou já revogado." }, { status: 404 });
}
