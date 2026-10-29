import { NextResponse, type NextRequest } from "next/server";
import { MediaSubmissionStatus, MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { reviewMediaSubmission } from "@/server/tenancy/media-review-action-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const roles = [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT];
const returnKeys = new Set(["page", "status", "classroomId", "studentId", "authorId", "from", "to"]);

function safeReturnQuery(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("?") || value.length > 800) return "";
  const incoming = new URLSearchParams(value.slice(1));
  const safe = new URLSearchParams();
  for (const [key, item] of incoming) {
    if (!returnKeys.has(key)) continue;
    if (key === "page" && /^\d{1,6}$/.test(item)) safe.set(key, item);
    else if (key === "status" && ["OPEN", "ALL", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "CHANGES_REQUESTED", "REJECTED", "WITHDRAWN"].includes(item)) safe.set(key, item);
    else if (["classroomId", "studentId", "authorId"].includes(key) && /^[A-Za-z0-9_-]{1,30}$/.test(item)) safe.set(key, item);
    else if (["from", "to"].includes(key) && /^\d{4}-\d{2}-\d{2}$/.test(item)) safe.set(key, item);
  }
  const serialized = safe.toString();
  return serialized ? `?${serialized}` : "";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string; submissionId: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const { escola, submissionId } = await params;
  let context;
  try { context = await resolveTenantContext(escola, roles); }
  catch (error) { return new NextResponse("Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const form = await request.formData();
  const action = form.get("action");
  const comment = String(form.get("comment") ?? "").trim().slice(0, 1000);
  const returnQuery = safeReturnQuery(form.get("returnTo"));
  if (action !== "UNDER_REVIEW" && action !== "APPROVED" && action !== "CHANGES_REQUESTED" && action !== "REJECTED") return new NextResponse("Decisão inválida.", { status: 400 });
  if ((action === "CHANGES_REQUESTED" || action === "REJECTED") && comment.length < 3) return new NextResponse("Informe uma orientação breve.", { status: 400 });

  const result = await reviewMediaSubmission(context, submissionId, action as MediaSubmissionStatus, comment || null);
  if (!result.ok) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(new URL(`/app/${encodeURIComponent(escola)}/midias${returnQuery}${returnQuery ? "&" : "?"}review=updated`, request.url), 303);
}
