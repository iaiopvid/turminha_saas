import { NextResponse } from "next/server";
import { EnrollmentStatus, MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";
import { getPrivateObject, isTenantStorageKey } from "@/server/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ escola: string; entryId: string; evidenceId: string }> }) {
  const { escola, entryId, evidenceId } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT]); }
  catch (error) { return new NextResponse("Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }
  const evidence = await prisma.journalEvidence.findFirst({
    where: {
      id: evidenceId, tenantId: context.tenantId, journalEntryId: entryId, status: "PRIVATE", scanStatus: "CLEAN",
      journalEntry: { classroom: { status: EnrollmentStatus.ACTIVE, ...(context.role === MembershipRole.SCHOOL_ADMIN || context.role === MembershipRole.COORDINATOR ? {} : { staff: { some: { tenantId: context.tenantId, membershipId: context.membershipId } } }) } },
    },
    select: { id: true, storageKey: true, contentType: true, originalFilename: true, byteSize: true },
  });
  if (!evidence || !isTenantStorageKey(evidence.storageKey, context.tenantId) || evidence.contentType !== "image/webp") return new NextResponse(null, { status: 404 });
  try {
    const object = await getPrivateObject(evidence.storageKey);
    return new NextResponse(Buffer.from(object.bytes), { status: 200, headers: {
      "Content-Type": "image/webp",
      "Content-Disposition": `attachment; filename="turminha-evidencia-${evidence.id}.webp"`,
      "Content-Length": String(evidence.byteSize),
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch { return new NextResponse("Arquivo privado indisponível.", { status: 503 }); }
}
