import { NextResponse, type NextRequest } from "next/server";
import { MediaSubmissionStatus, MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { reviewMediaSubmission } from "@/server/tenancy/media-review-action-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT];
const responseHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Requisição inválida." }, { status: 403, headers: responseHeaders });
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, roles); }
  catch (error) { return NextResponse.json({ error: "Acesso negado." }, { status: error instanceof ContextError ? error.status : 403, headers: responseHeaders }); }

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "Envie um formulário válido." }, { status: 400, headers: responseHeaders }); }
  if (form.get("action") !== "APPROVED") return NextResponse.json({ error: "A ação em lote disponível é aprovar para uso escolar." }, { status: 400, headers: responseHeaders });

  const rawIds = form.getAll("submissionId");
  if (rawIds.length > 25) return NextResponse.json({ error: "Selecione no máximo 25 envios por vez." }, { status: 413, headers: responseHeaders });
  if (rawIds.some((value) => typeof value !== "string")) return NextResponse.json({ error: "Identificadores inválidos." }, { status: 400, headers: responseHeaders });
  const submissionIds = [...new Set(rawIds as string[])];
  if (!submissionIds.length) return NextResponse.json({ error: "Selecione ao menos um envio." }, { status: 400, headers: responseHeaders });

  const results: { id: string; ok: boolean; reason?: string }[] = [];
  for (const submissionId of submissionIds) {
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(submissionId)) {
      results.push({ id: submissionId.slice(0, 30), ok: false, reason: "Identificador inválido." });
      continue;
    }
    try {
      const result = await reviewMediaSubmission(context, submissionId, MediaSubmissionStatus.APPROVED);
      results.push({ id: submissionId, ...result });
    } catch {
      results.push({ id: submissionId, ok: false, reason: "Falha ao salvar este envio; os demais foram processados separadamente." });
    }
  }
  return NextResponse.json({ results }, { headers: responseHeaders });
}
