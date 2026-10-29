import "server-only";
import { prisma } from "@/server/db/prisma";
import { requestHostMatchesTenant, TenantHostMismatch } from "@/server/tenancy/domains";

const DEFAULT_BRANDING = { brandPrimary: "#5524D1", brandAccent: "#F38BBD" } as const;
const HEX_COLOR = /^#[\da-fA-F]{6}$/;

export async function getTenantBranding(slug: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { slug, status: "ACTIVE" },
    select: { id: true, school: { select: { tenantId: true, brandPrimary: true, brandAccent: true } } },
  });
  if (!tenant?.school || tenant.school.tenantId !== tenant.id) return null;
  if (!await requestHostMatchesTenant(tenant.id)) throw new TenantHostMismatch();
  return {
    brandPrimary: HEX_COLOR.test(tenant.school.brandPrimary) ? tenant.school.brandPrimary : DEFAULT_BRANDING.brandPrimary,
    brandAccent: HEX_COLOR.test(tenant.school.brandAccent) ? tenant.school.brandAccent : DEFAULT_BRANDING.brandAccent,
  };
}
