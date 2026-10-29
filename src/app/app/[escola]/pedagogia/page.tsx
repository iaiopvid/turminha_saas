import Link from "next/link";
import { redirect } from "next/navigation";
import { EnrollmentStatus, LearningPlanStatus, MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { listAuthorizedClassrooms } from "@/server/tenancy/repositories";
import { prisma } from "@/server/db/prisma";
import { AdminSidebar } from "@/components/admin-sidebar";
import { PedagogicalTimeline } from "@/components/pedagogical-timeline";
import { getClassroomPedagogicalTimeline } from "@/server/tenancy/pedagogical-timeline-repository";

export const dynamic = "force-dynamic";
const pageSize = 10;
const statusLabels: Record<LearningPlanStatus, string> = { DRAFT: "Rascunho", SUBMITTED: "Aguardando revisão", APPROVED: "Aprovado", CHANGES_REQUESTED: "Ajustes solicitados", COMPLETED: "Executado", ARCHIVED: "Arquivado" };

export default async function PedagogyPage({ params, searchParams }: {
  params: Promise<{ escola: string }>;
  searchParams: Promise<{ classroomId?: string; status?: LearningPlanStatus; page?: string; saved?: string; error?: string; timelinePage?: string; timelineFrom?: string; timelineTo?: string; timelineEnrollmentId?: string; timelinePlanId?: string }>;
}) {
  const { escola } = await params;
  const query = await searchParams;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER]); }
  catch (error) { if (error instanceof ContextError && error.status === 401) redirect(`/entrar?tenant=${encodeURIComponent(escola)}`); return <main className="access-denied"><h1>Acesso restrito</h1><p>{error instanceof Error ? error.message : "Não foi possível abrir este espaço."}</p></main>; }
  const classrooms = await listAuthorizedClassrooms(context);
  const classroom = query.classroomId ? classrooms.find((item) => item.id === query.classroomId) : classrooms[0];
  const selectedStatus = query.status && Object.values(LearningPlanStatus).includes(query.status) ? query.status : undefined;
  const where = classroom ? { tenantId: context.tenantId, classroomId: classroom.id, ...(selectedStatus ? { status: selectedStatus } : {}) } : { tenantId: context.tenantId, classroomId: "" };
  const total = await prisma.learningPlan.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const page = Math.min(requestedPage, pageCount);
  const plans = await prisma.learningPlan.findMany({
    where,
    select: { id: true, title: true, ageGroup: true, periodStart: true, periodEnd: true, durationMinutes: true, materials: true, intentions: true, status: true, reviewComment: true, threadId: true, version: true, authorMembershipId: true, author: { select: { user: { select: { displayName: true } } } } },
    orderBy: [{ updatedAt: "desc" }, { threadId: "asc" }, { version: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const latestPlans = classroom && plans.length ? await prisma.learningPlan.findMany({
    where: { tenantId: context.tenantId, classroomId: classroom.id, threadId: { in: [...new Set(plans.map((plan) => plan.threadId))] }, revisions: { none: {} } },
    select: { id: true, threadId: true },
  }) : [];
  const latestByThread = new Map(latestPlans.map((plan) => [plan.threadId, plan.id]));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: context.timezone }).format(new Date());
  const href = (targetPage: number) => `/app/${encodeURIComponent(escola)}/pedagogia?classroomId=${encodeURIComponent(classroom?.id ?? "")}${selectedStatus ? `&status=${selectedStatus}` : ""}&page=${targetPage}`;
  const isReviewer = context.role === MembershipRole.SCHOOL_ADMIN || context.role === MembershipRole.COORDINATOR;
  const timeline = classroom ? await getClassroomPedagogicalTimeline(context, {
    classroomId: classroom.id,
    page: Number.parseInt(query.timelinePage ?? "1", 10),
    from: query.timelineFrom,
    to: query.timelineTo,
    enrollmentId: query.timelineEnrollmentId,
    learningPlanId: query.timelinePlanId,
  }) : null;

  return <div className="admin-shell"><AdminSidebar slug={escola} active="pedagogia" schoolName={context.schoolName} displayName={context.displayName}/><main className="admin-main"><div className="admin-content max-w-5xl">
    <div className="dashboard-heading"><div><p className="eyebrow">PLANEJAMENTO DA EQUIPE</p><h1>Pedagogia</h1><p className="muted">Planejamentos privados com revisão por versão. As intenções são texto da equipe, não códigos oficiais da BNCC.</p></div></div>
    {query.saved && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-emerald-900">{query.saved === "approved" ? "Plano aprovado." : query.saved === "returned" ? "Plano devolvido com orientação." : query.saved === "submitted" ? "Plano enviado para revisão." : query.saved === "revision" ? "Nova versão criada como rascunho." : "Rascunho salvo."}</p>}
    {query.error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-rose-900">Não foi possível concluir. Confira o período, o comentário e o estado atual do plano.</p>}
    {!classrooms.length ? <p className="rounded-2xl bg-amber-50 p-5">Nenhuma turma está atribuída ao seu vínculo.</p> : !classroom ? <p className="rounded-2xl bg-amber-50 p-5">A turma selecionada não está mais no seu escopo.</p> : <>
      {classrooms.length > 1 && <form method="get" className="mb-5 flex flex-wrap items-end gap-3"><label className="field-label">Turma<select className="field-input min-w-56" name="classroomId" defaultValue={classroom.id}>{classrooms.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.schoolYear}</option>)}</select></label><button className="button-secondary">Abrir turma</button></form>}
      <section className="dashboard-card"><div className="card-heading"><h2>Novo planejamento · {classroom.name}</h2><span className="muted">Rascunho privado</span></div>
        <form action={`/api/app/${encodeURIComponent(escola)}/pedagogia`} method="post" className="mt-5 grid gap-4"><input type="hidden" name="action" value="create"/><input type="hidden" name="classroomId" value={classroom.id}/>
          <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Título<input className="field-input" name="title" required minLength={3} maxLength={160} placeholder="Ex.: Descobertas no jardim"/></label><label className="field-label">Grupo etário definido pela escola<input className="field-input" name="ageGroup" required minLength={2} maxLength={80} placeholder="Ex.: crianças bem pequenas"/></label></div>
          <div className="grid gap-4 sm:grid-cols-3"><label className="field-label">Início<input className="field-input" type="date" name="periodStart" required defaultValue={today}/></label><label className="field-label">Fim<input className="field-input" type="date" name="periodEnd" required defaultValue={today}/></label><label className="field-label">Duração em minutos<input className="field-input" type="number" name="durationMinutes" min={5} max={480} placeholder="Opcional"/></label></div>
          <label className="field-label">Materiais <span className="font-normal text-slate-500">(opcional)</span><input className="field-input" name="materials" maxLength={1000}/></label>
          <label className="field-label">Intenções e proposta da equipe<textarea className="field-input min-h-32" name="intentions" required minLength={10} maxLength={5000} placeholder="Descreva objetivos e experiências planejadas em linguagem própria da equipe. Não insira códigos BNCC não verificados."/></label>
          <button className="button-primary justify-self-start">Salvar rascunho</button>
        </form>
      </section>

      <section className="mt-6" aria-labelledby="plans-title"><div className="card-heading mb-3"><h2 id="plans-title">Planejamentos e revisão</h2><span className="muted">{total} versão(ões)</span></div>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3"><input type="hidden" name="classroomId" value={classroom.id}/><label className="field-label">Status<select name="status" className="field-input min-w-52" defaultValue={selectedStatus ?? "ALL"}><option value="ALL">Todos</option>{Object.values(LearningPlanStatus).map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></label><button className="button-secondary">Filtrar</button></form>
        {plans.length ? <div className="grid gap-4">{plans.map((plan) => { const isLatest = latestByThread.get(plan.threadId) === plan.id; const isAuthor = plan.authorMembershipId === context.membershipId; const canRevise = isAuthor && isLatest && plan.status === LearningPlanStatus.CHANGES_REQUESTED;
          return <article key={plan.id} className="dashboard-card"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Versão {plan.version} · {plan.ageGroup}</p><h3 className="mt-1 text-lg font-bold">{plan.title}</h3><p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "medium" }).format(plan.periodStart)} – {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "medium" }).format(plan.periodEnd)} · {plan.author.user.displayName}</p></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-800">{statusLabels[plan.status]}</span></div>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{plan.intentions}</p>{plan.materials && <p className="mt-2 text-sm"><strong>Materiais:</strong> {plan.materials}</p>}{plan.durationMinutes && <p className="mt-2 text-sm"><strong>Duração:</strong> {plan.durationMinutes} minutos</p>}{plan.reviewComment && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><strong>Orientação da revisão:</strong> {plan.reviewComment}</p>}
            {isLatest && plan.status === LearningPlanStatus.DRAFT && isAuthor && <form action={`/api/app/${encodeURIComponent(escola)}/pedagogia`} method="post" className="mt-4"><input type="hidden" name="action" value="submit"/><input type="hidden" name="planId" value={plan.id}/><button className="button-secondary">Enviar para revisão</button></form>}
            {canRevise && <form action={`/api/app/${encodeURIComponent(escola)}/pedagogia`} method="post" className="mt-4 grid gap-3 border-t border-slate-100 pt-4"><input type="hidden" name="action" value="revise"/><input type="hidden" name="previousPlanId" value={plan.id}/><p className="text-sm font-semibold">Criar a próxima versão (a versão anterior permanece no histórico)</p><div className="grid gap-3 sm:grid-cols-2"><label className="field-label">Título<input className="field-input" name="title" defaultValue={plan.title} required minLength={3} maxLength={160}/></label><label className="field-label">Grupo etário<input className="field-input" name="ageGroup" defaultValue={plan.ageGroup} required minLength={2} maxLength={80}/></label></div><div className="grid gap-3 sm:grid-cols-3"><label className="field-label">Início<input className="field-input" type="date" name="periodStart" defaultValue={plan.periodStart.toISOString().slice(0, 10)} required/></label><label className="field-label">Fim<input className="field-input" type="date" name="periodEnd" defaultValue={plan.periodEnd.toISOString().slice(0, 10)} required/></label><label className="field-label">Duração<input className="field-input" type="number" name="durationMinutes" min={5} max={480} defaultValue={plan.durationMinutes ?? ""}/></label></div><label className="field-label">Materiais<input className="field-input" name="materials" maxLength={1000} defaultValue={plan.materials ?? ""}/></label><label className="field-label">Intenções revisadas<textarea className="field-input min-h-28" name="intentions" minLength={10} maxLength={5000} required defaultValue={plan.intentions}/></label><button className="button-primary justify-self-start">Criar nova versão</button></form>}
            {isLatest && plan.status === LearningPlanStatus.SUBMITTED && isReviewer && !isAuthor && <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4"><form action={`/api/app/${encodeURIComponent(escola)}/pedagogia`} method="post"><input type="hidden" name="action" value="decide"/><input type="hidden" name="decision" value="approve"/><input type="hidden" name="planId" value={plan.id}/><input type="hidden" name="reviewComment" value=""/><button className="button-primary">Aprovar plano</button></form><form action={`/api/app/${encodeURIComponent(escola)}/pedagogia`} method="post" className="grid gap-3 sm:grid-cols-[1fr_auto]"><input type="hidden" name="action" value="decide"/><input type="hidden" name="decision" value="request_changes"/><input type="hidden" name="planId" value={plan.id}/><label className="field-label">Orientação para ajustes<textarea className="field-input min-h-20" name="reviewComment" required minLength={3} maxLength={1000}/></label><button className="button-secondary self-end">Solicitar ajustes</button></form></div>}
          </article>;
        })}</div> : <p className="rounded-2xl border border-dashed border-violet-200 bg-white p-8 text-center text-slate-600">Nenhum planejamento neste filtro.</p>}
        {pageCount > 1 && <nav aria-label="Paginação dos planejamentos" className="mt-5 flex flex-wrap items-center justify-center gap-2"><span className="mr-2 text-sm text-slate-600">Página {page} de {pageCount}</span>{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <Link key={number} href={href(number)} aria-current={number === page ? "page" : undefined} className={`grid size-10 place-items-center rounded-xl border text-sm font-bold ${number === page ? "border-violet-700 bg-violet-700 text-white" : "border-slate-200 bg-white text-violet-800"}`}>{number}</Link>)}</nav>}
      </section>
      {timeline && <PedagogicalTimeline escola={escola} data={timeline}/>}
    </>}
  </div></main></div>;
}
