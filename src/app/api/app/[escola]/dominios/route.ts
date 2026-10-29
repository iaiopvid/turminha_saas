import { randomBytes } from "node:crypto";
import { MembershipRole } from "@/generated/prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { domainVerificationValue, isPlatformHostname, normalizeDomainName, verifyDomainTxt } from "@/server/tenancy/domains";
import { prisma } from "@/server/db/prisma";

function result(request: NextRequest, slug: string, value: string) {
  const url = new URL(`/app/${encodeURIComponent(slug)}/configuracoes`, request.url);
  url.searchParams.set("domain", value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisicao invalida.", { status: 403 });
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN]); }
  catch (error) { return new NextResponse(error instanceof ContextError ? error.message : "Acesso negado.", { status: error instanceof ContextError ? error.status : 403 }); }

  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  if (action === "start") {
    let hostname: string;
    try { hostname = normalizeDomainName(String(form.get("hostname") ?? "")); }
    catch { return result(request, escola, "invalid"); }
    if (isPlatformHostname(hostname)) return result(request, escola, "reserved");
    const ownDomain = await prisma.tenantDomain.findUnique({ where: { hostname }, select: { id: true, tenantId: true, status: true } });
    if (ownDomain && ownDomain.tenantId !== context.tenantId) return result(request, escola, "unavailable");
    if (ownDomain?.status === "VERIFIED") return result(request, escola, "verified");
    try {
      if (!ownDomain) await prisma.tenantDomain.create({ data: { tenantId: context.tenantId, hostname, verificationToken: randomBytes(24).toString("hex") } });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") return result(request, escola, "unavailable");
      throw error;
    }
    return result(request, escola, "pending");
  }

  const domainId = String(form.get("domainId") ?? "");
  const domain = await prisma.tenantDomain.findFirst({ where: { id: domainId, tenantId: context.tenantId }, select: { id: true, hostname: true, verificationToken: true, status: true } });
  if (!domain) return result(request, escola, "unavailable");
  if (action === "verify") {
    if (domain.status === "VERIFIED") return result(request, escola, "verified");
    if (!await verifyDomainTxt(domain.hostname, domain.verificationToken)) return result(request, escola, "proof-missing");
    const updated = await prisma.tenantDomain.updateMany({ where: { id: domain.id, tenantId: context.tenantId, status: "PENDING", verificationToken: domain.verificationToken }, data: { status: "VERIFIED", verifiedAt: new Date() } });
    return result(request, escola, updated.count === 1 ? "verified" : "changed");
  }
  if (action === "remove") {
    if (!await verifyDomainTxt(domain.hostname, domain.verificationToken)) return result(request, escola, "proof-missing");
    const removed = await prisma.tenantDomain.deleteMany({ where: { id: domain.id, tenantId: context.tenantId, hostname: domain.hostname, verificationToken: domain.verificationToken } });
    return result(request, escola, removed.count === 1 ? "removed" : "changed");
  }
  return result(request, escola, "invalid");
}
