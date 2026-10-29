import type { CSSProperties, ReactNode } from "react";
import { getTenantBranding } from "@/server/tenancy/branding";
import { TenantHostMismatch } from "@/server/tenancy/domains";
import { notFound } from "next/navigation";

export async function TenantTheme({ slug, children }: { slug: string; children: ReactNode }) {
  let branding;
  try { branding = await getTenantBranding(slug); }
  catch (error) { if (error instanceof TenantHostMismatch) notFound(); throw error; }
  const style = {
    "--tenant-primary": branding?.brandPrimary ?? "#5524D1",
    "--tenant-accent": branding?.brandAccent ?? "#F38BBD",
  } as CSSProperties;
  return <div className="tenant-theme" style={style} data-tenant-theme={branding ? "school" : "default"}>{children}</div>;
}
