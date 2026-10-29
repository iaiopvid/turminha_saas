import Link from "next/link";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { AttendanceStatus, EnrollmentStatus, MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { listAuthorizedClassrooms } from "@/server/tenancy/repositories";
import { prisma } from "@/server/db/prisma";
import { AdminSidebar } from "@/components/admin-sidebar";
import { JournalEvidenceShareRequest } from "@/components/journal-evidence-share-request";

export const dynamic = "force-dynamic";
const pageSize = 10;

export default async function ClassJournalPage({ params, searchParams }: {
  params: Promise<{ escola: string }>;
  searchParams: Promise<{ classroomId?: string; page?: string; saved?: string; error?: string; entry?: string; evidenceUploaded?: string; evidenceInvalid?: string; evidenceStorageError?: string; shareRequested?: string; shareClosed?: string }>;
}) {
  const { escola } = await params;
  const query = await searchParams;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT]); }
  catch (error) { if (error instanceof ContextError && error.status === 401) redirect(`/entrar?tenant=${encodeURIComponent(escola)}`); return <main className="access-denied"><h1>Acesso restrito</h1><p>{error instanceof Error ? error.message : "Não foi possível abrir este espaço."}</p></main>; }

  const classrooms = await listAuthorizedClassrooms(context);
  const classroom = query.classroomId ? classrooms.find((item) => item.id === query.classroomId) : classrooms[0];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: context.timezone }).format(new Date());
  const classDate = new Date(`${today}T00:00:00.000Z`);
  const enrollments = classroom ? await prisma.enrollment.findMany({
    where: { tenantId: context.tenantId, classroomId: classroom.id, status: EnrollmentStatus.ACTIVE },
    select: { id: true, student: { select: { displayName: true } }, attendance: { where: { tenantId: context.tenantId, classDate }, select: { status: true }, take: 1 } },
    orderBy: { student: { displayName: "asc" } },
    take: 100,
  }) : [];
  const participants = enrollments.filter((item) => item.attendance[0]?.status !== AttendanceStatus.ABSENT && item.attendance[0]?.status !== AttendanceStatus.EXCUSED);
  const approvedPlans = classroom ? await prisma.learningPlan.findMany({
    where: { tenantId: context.tenantId, classroomId: classroom.id, status: "APPROVED" },
    select: { id: true, title: true, version: true, periodStart: true, periodEnd: true },
    orderBy: [{ periodStart: "desc" }, { title: "asc" }],
    take: 50,
  }) : [];

  const where = classroom ? { tenantId: context.tenantId, classroomId: classroom.id } : { tenantId: context.tenantId, classroomId: "" };
  const total = await prisma.journalEntry.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const page = Math.min(requestedPage, pageCount);
  const entries = await prisma.journalEntry.findMany({
    where,
    select: {
      id: true, title: true, description: true, materials: true, happenedAt: true, createdAt: true,
      learningPlan: { select: { title: true, version: true } },
      evidence: { select: { id: true, originalFilename: true, scanStatus: true, status: true, byteSize: true, familyShares: { where: { tenantId: context.tenantId, closedAt: null }, select: { enrollmentId: true } } }, orderBy: { createdAt: "desc" } },
      author: { select: { user: { select: { displayName: true } } } },
      participants: { select: { enrollmentId: true, observation: true, enrollment: { select: { student: { select: { displayName: true } } } } } },
    },
    orderBy: [{ happenedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const href = (targetPage: number) => `/app/${encodeURIComponent(escola)}/diario?classroomId=${encodeURIComponent(classroom?.id ?? "")}&page=${targetPage}`;

  return <div className="admin-shell">
    <AdminSidebar slug={escola} active="diario" schoolName={context.schoolName} displayName={context.displayName}/>
    <main className="admin-main"><div className="admin-content max-w-5xl">
      <div className="dashboard-heading"><div><p className="eyebrow">ROTINA E REGISTROS INTERNOS</p><h1>Diário de classe</h1><p className="muted">Registre o que aconteceu e quem participou. Este registro não é enviado às famílias.</p></div>
        {classrooms.length > 1 && <form method="get" className="flex items-end gap-2"><label className="class-select-label">Turma<select name="classroomId" className="class-select" defaultValue={classroom?.id}>{classrooms.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.schoolYear}</option>)}</select></label><button className="button-secondary px-3 py-2">Abrir</button></form>}
      </div>

      {query.saved && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-emerald-900">Registro salvo no diário da turma.</p>}
      {query.evidenceUploaded && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-emerald-900">Evidência recebida. Ela só poderá ser baixada depois da verificação de segurança.</p>}
      {query.evidenceInvalid && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-rose-900">Arquivo inválido. Envie até 3 imagens JPEG, PNG ou WebP, com até 5 MB cada.</p>}
      {query.evidenceStorageError && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-rose-900">O armazenamento privado está indisponível; a evidência não foi anexada.</p>}
      {query.error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-rose-900">Não foi possível salvar. Confira a turma, a atividade e os participantes que estavam presentes.</p>}
      {!classrooms.length ? <p className="rounded-2xl bg-amber-50 p-5">Nenhuma turma autorizada está atribuída ao seu vínculo.</p> : !classroom ? <p className="rounded-2xl bg-amber-50 p-5">A turma selecionada não está mais no seu escopo.</p> : <>
        <section className="dashboard-card" aria-labelledby="journal-form-title">
          <div className="card-heading"><h2 id="journal-form-title">Novo registro realizado · {classroom.name}</h2><span className="muted">{participants.length} participante(s) elegíveis</span></div>
          {participants.length ? <form action={`/api/app/${encodeURIComponent(escola)}/diario`} method="post" className="mt-5 grid gap-4">
            <input type="hidden" name="classroomId" value={classroom.id}/>
            <input type="hidden" name="idempotencyKey" value={randomUUID()}/>
            <label className="field-label">Planejamento aprovado <span className="font-normal text-slate-500">(opcional)</span><select className="field-input" name="learningPlanId" defaultValue=""><option value="">Atividade avulsa</option>{approvedPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title} · v{plan.version} · {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "short" }).format(plan.periodStart)}–{new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "short" }).format(plan.periodEnd)}</option>)}</select><span className="text-xs font-normal text-slate-500">A execução será salva separadamente; o planejamento aprovado não será alterado.</span></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Data da atividade<input className="field-input" type="date" name="happenedAt" defaultValue={today} required/></label><label className="field-label">Título da atividade<input className="field-input" name="title" minLength={3} maxLength={160} required placeholder="Ex.: Pintura com folhas"/></label></div>
            <label className="field-label">O que aconteceu?<textarea className="field-input min-h-32" name="description" minLength={10} maxLength={5000} required placeholder="Descreva a atividade realizada e as observações coletivas relevantes."/></label>
            <label className="field-label">Materiais utilizados <span className="font-normal text-slate-500">(opcional)</span><input className="field-input" name="materials" maxLength={1000} placeholder="Tintas, folhas, papel..."/></label>
            <fieldset className="rounded-2xl border border-slate-200 p-4"><legend className="px-2 text-sm font-bold text-slate-800">Quem participou?</legend><p className="mb-3 text-sm text-slate-600">Crianças com falta ou justificativa registrada nesta data não podem ser selecionadas. As observações individuais são internas e visíveis somente à equipe autorizada.</p><div className="grid gap-2">{participants.map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3"><label className="flex items-center gap-3 text-sm"><input type="checkbox" name="participantEnrollmentId" value={item.id} className="size-4 accent-violet-700"/><span className="font-medium">{item.student.displayName}</span>{item.attendance[0]?.status === AttendanceStatus.PRESENT || item.attendance[0]?.status === AttendanceStatus.LATE ? <span className="ml-auto text-xs text-emerald-700">{item.attendance[0].status === AttendanceStatus.PRESENT ? "Presente" : "Atraso"}</span> : null}</label><label className="mt-2 block text-xs font-medium text-slate-600">Observação pedagógica individual <textarea className="field-input mt-1 min-h-16 text-sm" name={`observation:${item.id}`} maxLength={1000} placeholder="Opcional. Se preenchida, marque a participação acima."/></label></div>)}</div></fieldset>
            <div className="flex flex-wrap items-center gap-4"><button className="button-primary">Salvar no diário</button><span className="text-xs text-slate-500">O registro fica restrito à equipe escolar autorizada.</span></div>
          </form> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-slate-600">Não há participantes elegíveis nesta turma e data. Verifique as matrículas e a chamada antes de registrar.</p>}
        </section>

        <section className="mt-6" aria-labelledby="journal-history-title"><div className="card-heading mb-3"><h2 id="journal-history-title">Registros da turma</h2><span className="muted">{total} registro(s)</span></div>
          {entries.length ? <div className="grid gap-3">{entries.map((entry) => <article key={entry.id} className="dashboard-card"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">{new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "long" }).format(entry.happenedAt)}</p><h3 className="mt-1 text-lg font-bold">{entry.title}</h3></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-800">Realizado</span></div><p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{entry.description}</p>{entry.learningPlan && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Planejamento executado:</strong> {entry.learningPlan.title} · v{entry.learningPlan.version}</p>}{entry.materials && <p className="mt-3 text-sm"><strong>Materiais:</strong> {entry.materials}</p>}<p className="mt-3 text-xs text-slate-500"><strong>Participantes:</strong> {entry.participants.map((participant) => participant.enrollment.student.displayName).join(", ")}</p>{entry.participants.filter((participant) => participant.observation).map((participant) => <p key={participant.enrollment.student.displayName} className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-slate-700"><strong>{participant.enrollment.student.displayName} · observação individual:</strong> {participant.observation}</p>)}{entry.evidence.length > 0 && <section className="mt-4 rounded-xl bg-slate-50 p-4"><h4 className="text-sm font-bold">Evidências privadas</h4><ul className="mt-2 space-y-2">{entry.evidence.map((evidence) => <li key={evidence.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{evidence.originalFilename} · {evidence.scanStatus === "INFECTED" || evidence.status === "REJECTED" ? "Arquivo bloqueado pela verificação de segurança" : evidence.scanStatus === "CLEAN" && evidence.status === "PRIVATE" ? `${Math.ceil(evidence.byteSize / 1024)} KB` : "Em quarentena: aguardando verificação de segurança"}</span>{evidence.scanStatus === "CLEAN" && evidence.status === "PRIVATE" && <a className="font-semibold text-violet-700 underline" href={`/api/app/${encodeURIComponent(escola)}/diario/${encodeURIComponent(entry.id)}/evidencias/${encodeURIComponent(evidence.id)}`}>Baixar arquivo</a>}{evidence.scanStatus === "CLEAN" && evidence.status === "PRIVATE" && <div className="mt-2 grid gap-1 border-t border-slate-200 pt-2">{entry.participants.map((participant) => <JournalEvidenceShareRequest key={`${evidence.id}-${participant.enrollmentId}`} escola={escola} entryId={entry.id} evidenceId={evidence.id} enrollmentId={participant.enrollmentId} studentName={participant.enrollment.student.displayName} requested={evidence.familyShares.some((share) => share.enrollmentId === participant.enrollmentId)}/>)}</div>}</li>)}</ul></section>}<form action={`/api/app/${encodeURIComponent(escola)}/diario/${encodeURIComponent(entry.id)}/evidencias`} method="post" encType="multipart/form-data" className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4"><label className="field-label">Anexar evidência privada <input className="field-input" type="file" name="files" accept="image/jpeg,image/png,image/webp" multiple required/><span className="text-xs font-normal text-slate-500">Até 3 imagens, 5 MB cada. Visíveis apenas à equipe autorizada; nunca publicadas nem enviadas às famílias.</span></label><button className="button-secondary">Enviar evidência</button></form><p className="mt-2 text-xs text-slate-500">Registrado por {entry.author.user.displayName}</p></article>)}</div> : <p className="rounded-2xl border border-dashed border-violet-200 bg-white p-8 text-center text-slate-600">Ainda não há atividades registradas para esta turma.</p>}
          {pageCount > 1 && <nav aria-label="Paginação do diário" className="mt-5 flex flex-wrap items-center justify-center gap-2"><span className="mr-2 text-sm text-slate-600">Página {page} de {pageCount}</span>{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <Link key={number} href={href(number)} aria-current={number === page ? "page" : undefined} className={`grid size-10 place-items-center rounded-xl border text-sm font-bold ${number === page ? "border-violet-700 bg-violet-700 text-white" : "border-slate-200 bg-white text-violet-800"}`}>{number}</Link>)}</nav>}
        </section>
      </>}
      <div className="mt-6 flex flex-wrap gap-3"><Link className="button-secondary" href={`/app/${encodeURIComponent(escola)}/turma`}>Ver minha turma</Link><Link className="button-secondary" href={`/app/${encodeURIComponent(escola)}/frequencia`}>Abrir chamada</Link></div>
    </div></main>
  </div>;
}
