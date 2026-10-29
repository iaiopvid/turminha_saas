import "server-only";
import { MembershipRole } from "@/generated/prisma/client";
import { getSessionPrincipal } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { requestHostMatchesTenant } from "@/server/tenancy/domains";

export type TenantContext = Readonly<{
  tenantId: string;
  tenantSlug: string;
  schoolName: string;
  timezone: string;
  userId: string;
  displayName: string;
  membershipId: string;
  role: MembershipRole;
}>;

export class ContextError extends Error {
  constructor(public readonly status: 401 | 403 | 404, message: string) {
    super(message);
    this.name = "ContextError";
  }
}

export async function resolveTenantContext(slug: string, allowedRoles?: MembershipRole[]) {
  const principal = await getSessionPrincipal();
  if (!principal) throw new ContextError(401, "Sua sessão expirou. Entre novamente.");

  const tenant = await prisma.tenant.findFirst({
    where: { slug, status: "ACTIVE" },
    select: { id: true, slug: true, school: { select: { name: true, timezone: true } } },
  });
  if (!tenant?.school) throw new ContextError(404, "Escola não encontrada.");
  if (!await requestHostMatchesTenant(tenant.id)) throw new ContextError(404, "Host nao autorizado para esta escola.");

  const membership = await prisma.membership.findFirst({
    where: { tenantId: tenant.id, userId: principal.user.id, status: "ACTIVE" },
    select: { id: true, role: true },
  });
  if (!membership) throw new ContextError(403, "Este vínculo não tem acesso a esta escola.");
  if (allowedRoles?.length && !allowedRoles.includes(membership.role)) {
    throw new ContextError(403, "Seu perfil não pode acessar este recurso.");
  }

  return Object.freeze({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    schoolName: tenant.school.name,
    timezone: tenant.school.timezone,
    userId: principal.user.id,
    displayName: principal.user.displayName,
    membershipId: membership.id,
    role: membership.role,
  }) satisfies TenantContext;
}
