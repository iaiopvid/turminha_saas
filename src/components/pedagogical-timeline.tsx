import Link from "next/link";
import { getClassroomPedagogicalTimeline } from "@/server/tenancy/pedagogical-timeline-repository";

type TimelineData = NonNullable<Awaited<ReturnType<typeof getClassroomPedagogicalTimeline>>>;

export function PedagogicalTimeline({ escola, data }: { escola: string; data: TimelineData }) {
  const pageHref = (page: number) => {
    const query = new URLSearchParams({ classroomId: data.classroom.id, timelinePage: String(page) });
    if (data.from) query.set("timelineFrom", data.from);
    if (data.to) query.set("timelineTo", data.to);
    if (data.selectedEnrollmentId) query.set("timelineEnrollmentId", data.selectedEnrollmentId);
    if (data.selectedPlanId) query.set("timelinePlanId", data.selectedPlanId);
    return `/app/${encodeURIComponent(escola)}/pedagogia?${query.toString()}`;
  };
  return <section className="mt-6 dashboard-card" aria-labelledby="pedagogical-timeline-title">
    <div className="card-heading"><div><p className="eyebrow">ORIGEM: DIÁRIO DE CLASSE</p><h2 id="pedagogical-timeline-title">Linha pedagógica da turma</h2></div><span className="muted">{data.total} registro(s)</span></div>
    <p className="mt-2 text-sm text-slate-600">Visão organizada a partir dos registros do diário, com contexto, autoria, participantes, observações e evidências. Esta consulta não cria cópias nem publica conteúdo para famílias.</p>
    <form method="get" className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-5 sm:items-end">
      <input type="hidden" name="classroomId" value={data.classroom.id}/>
      <label className="field-label">De<input className="field-input" type="date" name="timelineFrom" defaultValue={data.from}/></label>
      <label className="field-label">Até<input className="field-input" type="date" name="timelineTo" defaultValue={data.to}/></label>
      <label className="field-label">Criança<select className="field-input" name="timelineEnrollmentId" defaultValue={data.selectedEnrollmentId}><option value="">Todas da turma</option>{data.enrollments.map((item) => <option key={item.id} value={item.id}>{item.student.displayName}{item.status === "ACTIVE" ? "" : " · matrícula encerrada"}</option>)}</select></label>
      <label className="field-label">Planejamento/objetivo<select className="field-input" name="timelinePlanId" defaultValue={data.selectedPlanId}><option value="">Todos</option>{data.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title} · v{plan.version}</option>)}</select></label>
      <button className="button-secondary">Filtrar registros</button>
    </form>
    <div className="mt-4 grid gap-4">{data.entries.map((entry) => <article key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">{new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "long" }).format(entry.happenedAt)} · Diário interno</p><h3 className="mt-1 text-lg font-bold">{entry.title}</h3></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-800">Registrado por {entry.author.user.displayName}</span></div>
      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{entry.description}</p>
      {entry.learningPlan && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950"><strong>Origem do planejamento:</strong> {entry.learningPlan.title} · v{entry.learningPlan.version}</p>}
      {entry.materials && <p className="mt-2 text-sm text-slate-600"><strong>Materiais:</strong> {entry.materials}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{entry.participants.map((participant) => <div key={participant.enrollmentId} className="rounded-xl bg-amber-50 p-3 text-sm"><strong>{participant.enrollment.student.displayName}</strong>{participant.observation ? <p className="mt-1 whitespace-pre-line text-slate-700">{participant.observation}</p> : <p className="mt-1 text-xs text-slate-500">Sem observação individual.</p>}</div>)}</div>
      {entry.evidence.length > 0 && <div className="mt-4 border-t border-slate-100 pt-3"><h4 className="text-sm font-bold">Evidências vinculadas</h4><ul className="mt-2 grid gap-2 sm:grid-cols-2">{entry.evidence.map((evidence) => <li key={evidence.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><span>{evidence.originalFilename} · {evidence.scanStatus === "CLEAN" && evidence.status === "PRIVATE" ? `${Math.ceil(evidence.byteSize / 1024)} KB · privada` : evidence.scanStatus === "INFECTED" || evidence.status === "REJECTED" ? "Bloqueada pela verificação" : "Em quarentena"}</span>{evidence.scanStatus === "CLEAN" && evidence.status === "PRIVATE" && <a className="font-semibold text-violet-700 underline" href={`/api/app/${encodeURIComponent(escola)}/diario/${encodeURIComponent(entry.id)}/evidencias/${encodeURIComponent(evidence.id)}`}>Abrir evidência</a>}</li>)}</ul></div>}
    </article>)}</div>
    {!data.entries.length && <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">Nenhum registro corresponde aos filtros desta turma.</p>}
    {data.pageCount > 1 && <nav aria-label="Páginas da linha pedagógica" className="mt-5 flex flex-wrap items-center justify-center gap-2"><span className="mr-2 text-sm text-slate-600">Página {data.page} de {data.pageCount}</span>{Array.from({ length: data.pageCount }, (_, index) => index + 1).map((page) => <Link key={page} href={pageHref(page)} aria-current={page === data.page ? "page" : undefined} className={`grid size-10 place-items-center rounded-xl border text-sm font-bold ${page === data.page ? "border-violet-700 bg-violet-700 text-white" : "border-slate-200 bg-white text-violet-800"}`}>{page}</Link>)}</nav>}
  </section>;
}
