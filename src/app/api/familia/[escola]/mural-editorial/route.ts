import { NextResponse } from "next/server";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { getFamilyEditorialMural } from "@/server/tenancy/family-editorial-mural-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ escola: string }> }) {
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.GUARDIAN]); }
  catch (error) { return NextResponse.json({ error: "Acesso negado." }, { status: error instanceof ContextError ? error.status : 403 }); }
  const query = new URL(request.url).searchParams;
  const cursor = query.get("cursor") ?? undefined;
  const rawStudentId = query.get("studentId");
  const page = await getFamilyEditorialMural(context, cursor, rawStudentId);
  if (!page) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  if (page.invalidCursor) return NextResponse.json({ error: "Cursor de navegação inválido ou fora do seu contexto." }, { status: 400, headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie" } });
  return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie" } });
}
