import "server-only";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { resolveTxt } from "node:dns/promises";
import { headers } from "next/headers";
import { prisma } from "@/server/db/prisma";

const LABEL = /^(?!-)[a-z\d-]{1,63}(?<!-)$/i;
const RESERVED_SUFFIXES = new Set(["localhost", "local", "internal", "test", "invalid", "example"]);
const TXT_PREFIX = "turminha-domain-verification=";

export class TenantHostMismatch extends Error {
  constructor() { super("This host is not assigned to the requested school."); this.name = "TenantHostMismatch"; }
}

export function normalizeDomainName(input: string): string {
  const raw = input.trim().replace(/\.$/, "");
  if (!raw || raw.length > 253 || /[\s/:@?#,\\]/.test(raw) || raw.includes("*")) throw new Error("Informe apenas um dominio completo, sem protocolo, caminho ou porta.");
  const ascii = domainToASCII(raw).toLowerCase();
  const labels = ascii.split(".");
  if (!ascii || ascii.length > 253 || isIP(ascii) || labels.length < 2 || labels.some((label) => !LABEL.test(label)) || RESERVED_SUFFIXES.has(labels.at(-1)!)) {
    throw new Error("Dominio invalido ou reservado.");
  }
  return ascii;
}

export function normalizeRequestHostname(input: string | null): string | null {
  if (!input || input.includes(",") || /[\s/@?#\\]/.test(input)) return null;
  try {
    const url = new URL(`http://${input}`);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
    return isIP(hostname) ? hostname : domainToASCII(hostname) || null;
  } catch { return null; }
}

export function isPlatformHostname(hostname: string): boolean {
  const configured = process.env.APP_BASE_URL;
  let appHost: string | null = null;
  try { appHost = configured ? normalizeRequestHostname(new URL(configured).host) : null; } catch { /* invalid configuration is not trusted */ }
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || (!!appHost && hostname === appHost);
}

export async function requestHostMatchesTenant(tenantId: string): Promise<boolean> {
  const hostname = normalizeRequestHostname((await headers()).get("host"));
  if (!hostname) return false;
  if (isPlatformHostname(hostname)) return true;
  const domain = await prisma.tenantDomain.findUnique({ where: { hostname }, select: { tenantId: true, status: true } });
  return domain?.status === "VERIFIED" && domain.tenantId === tenantId;
}

export async function resolveVerifiedDomain(hostname: string) {
  const normalized = normalizeRequestHostname(hostname);
  if (!normalized || isPlatformHostname(normalized)) return null;
  const domain = await prisma.tenantDomain.findUnique({
    where: { hostname: normalized },
    select: { status: true, tenant: { select: { id: true, slug: true, status: true } } },
  });
  return domain?.status === "VERIFIED" && domain.tenant.status === "ACTIVE" ? domain.tenant : null;
}

export async function verifyDomainTxt(domain: string, token: string, resolver: (hostname: string) => Promise<string[][]> = resolveTxt): Promise<boolean> {
  try {
    const records = await resolver(domain);
    return records.some((parts) => parts.join("") === `${TXT_PREFIX}${token}`);
  } catch { return false; }
}

export function domainVerificationValue(token: string) { return `${TXT_PREFIX}${token}`; }
