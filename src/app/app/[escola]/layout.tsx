import type { ReactNode } from "react";
import { TenantTheme } from "@/components/tenant-theme";

export const dynamic = "force-dynamic";

export default async function SchoolAppLayout({ children, params }: { children: ReactNode; params: Promise<{ escola: string }> }) {
  const { escola } = await params;
  return <TenantTheme slug={escola}>{children}</TenantTheme>;
}
