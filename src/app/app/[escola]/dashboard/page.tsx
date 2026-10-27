import { redirect } from "next/navigation";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { SchoolDashboard } from "@/components/school-dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params, searchParams }: { params: Promise<{ escola: string }>; searchParams: Promise<{ classroomId?: string }> }) {
  const { escola } = await params;
  const { classroomId } = await searchParams;
  let context;
  try {
    context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT]);
  } catch (error) {
    if (error instanceof ContextError && error.status === 401) redirect(`/entrar?tenant=${encodeURIComponent(escola)}`);
    return <main className="access-denied"><h1>Acesso restrito</h1><p>{error instanceof Error ? error.message : "Não foi possível abrir este espaço."}</p></main>;
  }
  return <SchoolDashboard context={context} classroomId={classroomId}/>;
}
