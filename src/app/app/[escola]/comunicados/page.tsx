import { redirect } from "next/navigation";
import Link from "next/link";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { listAuthorizedClassrooms } from "@/server/tenancy/repositories";
import { AdminSidebar } from "@/components/admin-sidebar";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage({ params, searchParams }: { params: Promise<{ escola: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { escola } = await params; const query = await searchParams;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER]); }
  catch (error) { if (error instanceof ContextError && error.status === 401) redirect(`/entrar?tenant=${encodeURIComponent(escola)}`); return <main className="access-denied">Acesso restrito à equipe escolar.</main>; }
  const classes = await listAuthorizedClassrooms(context);
  return <div className="admin-shell"><AdminSidebar slug={escola} active="comunicados" schoolName={context.schoolName} displayName={context.displayName}/><main className="admin-main"><div className="admin-content max-w-3xl"><Link className="font-semibold text-violet-700" href={`/app/${escola}/dashboard`}>← Voltar ao painel</Link><p className="eyebrow mt-8">COMUNICAÇÃO</p><h1 className="font-display text-3xl font-bold">Enviar recado</h1><p className="mt-2 text-slate-600">O recado ficará disponível no mural autenticado das famílias vinculadas à turma selecionada.</p>{query.error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-rose-800" role="alert">Confira o título, o texto e a turma.</p>}{query.success && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-emerald-900" role="status">Recado salvo e publicado para a turma autorizada.</p>}{classes.length ? <form action={`/api/app/${escola}/recados`} method="post" className="mt-6 space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><label className="field-label">Turma<select name="classroomId" className="field-input" required>{classes.map((item)=><option key={item.id} value={item.id}>{item.name} · {item.schoolYear}</option>)}</select></label><label className="field-label">Título<input name="title" className="field-input" required minLength={3} maxLength={160}/></label><label className="field-label">Mensagem<textarea name="body" className="field-input min-h-36" required minLength={3} maxLength={2000}/></label><button className="button-primary">Publicar recado</button></form>: <p className="mt-6 rounded-2xl bg-amber-50 p-5">Nenhuma turma está atribuída ao seu vínculo.</p>}</div></main></div>;
}
