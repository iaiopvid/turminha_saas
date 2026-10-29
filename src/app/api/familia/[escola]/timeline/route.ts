import { NextResponse } from "next/server";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { getFamilyAuthorizedTimeline } from "@/server/tenancy/family-journal-evidence-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ escola: string }> }) {
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.GUARDIAN]); }
  catch (error) { return NextResponse.json({ error: "Acesso negado." }, { status: error instanceof ContextError ? error.status : 403 }); }
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  const page = await getFamilyAuthorizedTimeline(context, cursor);
  if (!page) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie" } });
}
