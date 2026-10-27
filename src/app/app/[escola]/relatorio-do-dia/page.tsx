import Link from "next/link";
import { redirect } from "next/navigation";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { getTeacherDashboard } from "@/server/tenancy/repositories";

export const dynamic = "force-dynamic";

export default async function DailyReportPage({ params }: { params: Promise<{ escola: string }> }) {
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT]); }
  catch (error) { if (error instanceof ContextError && error.status === 401) redirect(`/entrar?tenant=${encodeURIComponent(escola)}`); return <main className="access-denied">Acesso restrito.</main>; }
  const snapshot = await getTeacherDashboard(context);
  return <main className="admin-main min-h-screen"><div className="admin-content"><Link className="font-semibold text-violet-700" href={`/app/${escola}/dashboard`}>← Voltar ao painel</Link><p className="eyebrow mt-8">RESUMO GERADO A PARTIR DOS REGISTROS PERSISTIDOS</p><h1 className="font-display text-3xl font-bold">Relatório do dia</h1><p className="mt-2 text-sm text-slate-600">{snapshot?.classroom?.name ?? "Sem turma"} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: context.timezone }).format(new Date())}</p><div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">Resumo automático dos dados salvos. Revise os registros antes de compartilhar com as famílias.</div>{snapshot?.notice && <section className="dashboard-card mt-5"><h2 className="font-display text-xl font-bold">Recado da turma</h2><h3 className="mt-3 font-semibold">{snapshot.notice.title}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{snapshot.notice.body}</p></section>}<section className="dashboard-card mt-5"><h2 className="font-display text-xl font-bold">Frequência</h2><p className="mt-2 text-sm">{snapshot?.metrics.marked ? `${snapshot.metrics.present} presença(s), ${snapshot.metrics.absent} ausência(s) registradas.` : "A chamada ainda não foi registrada."}</p><p className="mt-1 text-xs text-slate-500">{snapshot?.metrics.students ?? 0} matrícula(s) ativa(s) no contexto autorizado.</p></section></div></main>;
}
