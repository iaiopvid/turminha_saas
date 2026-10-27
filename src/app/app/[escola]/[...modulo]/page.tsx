import Link from "next/link";
import { redirect } from "next/navigation";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";

export const dynamic = "force-dynamic";

const labels: Record<string, string> = { turma: "Minha turma", diario: "Diário de classe", frequencia: "Frequência", pedagogia: "Pedagogia", midias: "Memórias e fotos", comunicados: "Recados", configuracoes: "Configurações", "relatorio-do-dia": "Relatório do dia" };

export default async function ModuleStatusPage({ params }: { params: Promise<{ escola: string; modulo: string[] }> }) {
  const { escola, modulo } = await params;
  const key = modulo.join("/");
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT]); }
  catch (error) { if (error instanceof ContextError && error.status === 401) redirect(`/entrar?tenant=${encodeURIComponent(escola)}`); return <main className="access-denied"><h1>Acesso não autorizado</h1><p>{error instanceof Error ? error.message : "Este contexto não está disponível."}</p></main>; }
  const title = labels[key] ?? "Módulo da escola";
  return <main className="module-pending"><Link href={`/app/${context.tenantSlug}/dashboard`} className="font-semibold text-violet-700">← Voltar ao painel</Link><p className="eyebrow mt-8">{context.schoolName}</p><h1>{title}</h1><p>Este fluxo ainda não foi habilitado nesta etapa. Nenhuma informação foi alterada.</p><span>Estado: implementação pendente</span></main>;
}
