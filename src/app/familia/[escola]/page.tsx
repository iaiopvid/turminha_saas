import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { getGuardianDashboard } from "@/server/tenancy/guardian-repository";

export const dynamic = "force-dynamic";

export default async function FamilyPage({ params }: { params: Promise<{ escola: string }> }) {
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.GUARDIAN]); }
  catch (error) {
    if (error instanceof ContextError && error.status === 401) redirect(`/entrar?tenant=${encodeURIComponent(escola)}`);
    if (error instanceof ContextError && error.status === 404) notFound();
    return <main className="min-h-screen bg-[#e0f7fa] p-8"><section className="mx-auto max-w-xl rounded-3xl bg-white p-8"><h1 className="font-display text-3xl font-bold">Acesso restrito</h1><p className="mt-3">Este espaço exige um vínculo familiar ativo e aprovado nesta escola.</p><Link className="mt-5 inline-block text-violet-700 underline" href={`/entrar?tenant=${escola}`}>Voltar ao acesso</Link></section></main>;
  }
  const data = await getGuardianDashboard(context);
  if (!data) notFound();
  return <div className="classroom-world min-h-screen px-4 py-7 sm:px-6">
    <main className="relative z-10 mx-auto max-w-5xl space-y-6">
      <header className="glass-panel flex flex-wrap items-center justify-between gap-4 border-yellow-200"><div><p className="font-display text-sm font-bold uppercase tracking-widest text-pink-500">Turminha · {context.schoolName}</p><h1 className="mt-1 font-display text-3xl font-bold">Cantinho da família</h1><p className="mt-2 text-sm">Olá, {context.displayName}. Aqui ficam os conteúdos compartilhados com sua família.</p></div><form action="/api/auth/signout" method="post"><button className="button-soft">Sair da conta</button></form></header>
      <section className="glass-panel"><h2 className="section-title"><span className="icon-bubble bg-pink-100 text-pink-500">♡</span>Seu espaço de carinho</h2>
        {data.students.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2">{data.students.map((student) => <article className="rounded-3xl border-2 border-pink-100 bg-white/80 p-5" key={student.id}><span className="grid h-16 w-16 place-items-center rounded-full border-4 border-pink-200 bg-sky-100 text-2xl" aria-hidden="true">🌼</span><h3 className="mt-3 font-display text-xl font-bold">Cantinho de {student.displayName}</h3><p className="mt-1 text-sm text-slate-600">{student.enrollments.map((item) => item.classroom.name).join(", ") || "Turma em atualização"}</p></article>)}</div> : <div className="mt-4 rounded-2xl border-2 border-dashed border-pink-200 bg-white/70 p-6 text-sm">Ainda não há vínculo familiar aprovado nesta escola. A secretaria pode orientar a validação do acesso.</div>}
      </section>
      <section className="grid gap-5 md:grid-cols-2"><article className="glass-panel"><h2 className="section-title">Mural das professoras</h2>{data.notices.length ? <div className="mt-4 space-y-3">{data.notices.slice(0,3).map((notice) => <div className="rounded-2xl bg-amber-50 p-4" key={notice.id}><h3 className="font-display font-bold text-amber-900">{notice.title}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6">{notice.body}</p></div>)}</div> : <p className="mt-3 text-sm text-slate-600">Nenhum recado compartilhado por enquanto.</p>}</article><article className="glass-panel border-t-8 border-pink-300"><h2 className="section-title">Minhas recordações guardadas</h2><p className="mt-3 text-sm leading-6">O álbum familiar fica privado. O serviço de armazenamento seguro ainda está sendo preparado para este ambiente.</p><span className="mt-4 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">Armazenamento não configurado</span></article></section>
      <Link href={`/s/${escola}`} className="inline-flex font-semibold text-violet-700 underline">Voltar ao Mundo Mágico</Link>
    </main>
  </div>;
}
