import Link from "next/link";
import { redirect } from "next/navigation";
import { Baby } from "lucide-react";
import { AttendanceStatus, EnrollmentStatus, MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { listAuthorizedClassrooms } from "@/server/tenancy/repositories";
import { prisma } from "@/server/db/prisma";
import { AdminSidebar } from "@/components/admin-sidebar";

export const dynamic = "force-dynamic";
const pageSize = 20;

export default async function ClassroomRosterPage({ params, searchParams }: {
  params: Promise<{ escola: string }>;
  searchParams: Promise<{ classroomId?: string; page?: string; q?: string }>;
}) {
  const { escola } = await params;
  const query = await searchParams;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT]); }
  catch (error) { if (error instanceof ContextError && error.status === 401) redirect(`/entrar?tenant=${encodeURIComponent(escola)}`); return <main className="access-denied"><h1>Acesso restrito</h1><p>{error instanceof Error ? error.message : "Não foi possível abrir este espaço."}</p></main>; }

  const classrooms = await listAuthorizedClassrooms(context);
  const classroom = query.classroomId ? classrooms.find((item) => item.id === query.classroomId) : classrooms[0];
  const search = (query.q ?? "").trim().slice(0, 80);
  const where = classroom ? {
    tenantId: context.tenantId,
    classroomId: classroom.id,
    status: EnrollmentStatus.ACTIVE,
    ...(search ? { student: { displayName: { contains: search } } } : {}),
  } : { tenantId: context.tenantId, classroomId: "", status: EnrollmentStatus.ACTIVE };
  const total = await prisma.enrollment.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const page = Math.min(requestedPage, pageCount);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: context.timezone }).format(new Date());
  const classDate = new Date(`${today}T00:00:00.000Z`);
  const enrollments = await prisma.enrollment.findMany({
    where,
    select: {
      id: true, validFrom: true,
      student: { select: { id: true, displayName: true } },
      attendance: { where: { tenantId: context.tenantId, classDate }, select: { status: true }, take: 1 },
    },
    orderBy: { student: { displayName: "asc" } },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const href = (targetPage: number) => `/app/${encodeURIComponent(escola)}/turma?classroomId=${encodeURIComponent(classroom?.id ?? "")}&page=${targetPage}${search ? `&q=${encodeURIComponent(search)}` : ""}`;

  return <div className="admin-shell"><AdminSidebar slug={escola} active="turma" schoolName={context.schoolName} displayName={context.displayName}/><main className="admin-main"><div className="admin-content max-w-5xl">
    <div className="dashboard-heading"><div><p className="eyebrow">MINHAS TURMAS</p><h1>Minha turma</h1><p className="muted">Lista atual de crianças nas turmas autorizadas para seu vínculo.</p></div></div>
    {!classrooms.length ? <p className="rounded-2xl bg-amber-50 p-5">Nenhuma turma está atribuída ao seu vínculo.</p> : !classroom ? <p className="rounded-2xl bg-amber-50 p-5">A turma selecionada não está mais no seu escopo.</p> : <>
      <section className="dashboard-card"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">{classroom.schoolYear} · {context.schoolName}</p><h2 className="mt-1 text-2xl font-bold">{classroom.name}</h2><p className="mt-1 text-sm text-slate-600">{total} criança(s) com matrícula ativa</p></div><div className="flex flex-wrap gap-2"><Link className="button-secondary" href={`/app/${encodeURIComponent(escola)}/frequencia`}>Chamada de hoje</Link><Link className="button-primary" href={`/app/${encodeURIComponent(escola)}/diario?classroomId=${encodeURIComponent(classroom.id)}`}>Abrir diário</Link></div></div>
        {classrooms.length > 1 && <form method="get" className="mt-5 flex flex-wrap items-end gap-3"><label className="field-label min-w-56">Trocar turma<select name="classroomId" className="field-input" defaultValue={classroom.id}>{classrooms.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.schoolYear}</option>)}</select></label><button className="button-secondary">Abrir turma</button></form>}
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3"><input type="hidden" name="classroomId" value={classroom.id}/><label className="field-label min-w-56 flex-1">Buscar criança<input name="q" className="field-input" maxLength={80} defaultValue={search} placeholder="Digite o nome"/></label><button className="button-secondary">Buscar</button>{search && <Link className="button-secondary" href={`/app/${encodeURIComponent(escola)}/turma?classroomId=${encodeURIComponent(classroom.id)}`}>Limpar</Link>}</form>
      </section>

      <section className="mt-5" aria-labelledby="roster-title"><div className="card-heading mb-3"><h2 id="roster-title">Crianças matriculadas</h2><span className="muted">Página {page} de {pageCount}</span></div>{enrollments.length ? <ul className="grid gap-3 sm:grid-cols-2">{enrollments.map((enrollment) => {
        const status = enrollment.attendance[0]?.status;
        const statusLabel = status === AttendanceStatus.PRESENT ? "Presente" : status === AttendanceStatus.LATE ? "Atraso" : status === AttendanceStatus.ABSENT ? "Ausente" : status === AttendanceStatus.EXCUSED ? "Justificada" : "Não registrado";
        const statusClass = status === AttendanceStatus.PRESENT ? "status-present" : status === AttendanceStatus.LATE ? "status-late" : status === AttendanceStatus.ABSENT || status === AttendanceStatus.EXCUSED ? "status-absent" : "status-unmarked";
        return <li key={enrollment.id} className="dashboard-card flex items-center gap-4"><span className="student-avatar" aria-hidden="true"><Baby size={25} strokeWidth={1.8}/></span><div className="min-w-0 flex-1"><h3 className="truncate font-bold">{enrollment.student.displayName}</h3><p className="mt-1 text-xs text-slate-500">Matrícula ativa desde {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "medium" }).format(enrollment.validFrom)}</p></div><span className={`attendance-status ${statusClass}`}>{statusLabel}</span></li>;
      })}</ul> : <p className="rounded-2xl border border-dashed border-violet-200 bg-white p-8 text-center text-slate-600">{search ? "Nenhuma criança corresponde à busca." : "Esta turma ainda não possui matrículas ativas."}</p>}
        {pageCount > 1 && <nav aria-label="Paginação da turma" className="mt-5 flex flex-wrap items-center justify-center gap-2"><span className="mr-2 text-sm text-slate-600">Página {page} de {pageCount}</span>{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <Link key={number} href={href(number)} aria-current={number === page ? "page" : undefined} className={`grid size-10 place-items-center rounded-xl border text-sm font-bold ${number === page ? "border-violet-700 bg-violet-700 text-white" : "border-slate-200 bg-white text-violet-800"}`}>{number}</Link>)}</nav>}
      </section>
    </>}
  </div></main></div>;
}
