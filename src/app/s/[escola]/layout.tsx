import type { ReactNode } from "react";
import { TenantTheme } from "@/components/tenant-theme";

export const dynamic = "force-dynamic";

export default async function PublicSchoolLayout({ children, params }: { children: ReactNode; params: Promise<{ escola: string }> }) {
  const { escola } = await params;
  return <TenantTheme slug={escola}>{children}</TenantTheme>;
}
