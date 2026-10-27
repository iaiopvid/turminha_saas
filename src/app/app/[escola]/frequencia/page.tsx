import { redirect } from "next/navigation";
import Link from "next/link";
import { AttendanceStatus, EnrollmentStatus, MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { listAuthorizedClassrooms } from "@/server/tenancy/repositories";
import { prisma } from "@/server/db/prisma";
import { AdminSidebar } from "@/components/admin-sidebar";

export const dynamic = "force-dynamic";

export default async function AttendancePage({ params, searchParams }: { params: Promise<{ escola: string }>; searchParams: Promise<{ salva?: string }> }) {
  const { escola } = await params; const query = await searchParams;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER]); }
  catch (error) { if (error instanceof ContextError && error.status === 401) redirect(`/entrar?tenant=${encodeURIComponent(escola)}`); return <main className="access-denied">Acesso restrito à equipe escolar.</main>; }
  const classes = await listAuthorizedClassrooms(context); const classroom = classes[0];
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: context.timezone }).format(new Date());
  const classDate = new Date(`${date}T00:00:00.000Z`);
  const students = classroom ? await prisma.enrollment.findMany({ where: { tenantId: context.tenantId, classroomId: classroom.id, status: EnrollmentStatus.ACTIVE }, select: { id: true, student: { select: { displayName: true } }, attendance: { where: { tenantId: context.tenantId, classDate }, select: { status: true }, take: 1 } }, orderBy: { student: { displayName: "asc" } }, take: 100 }) : [];
  return <div className="admin-shell"><AdminSidebar slug={escola} active="frequencia" schoolName={context.schoolName} displayName={context.displayName}/><main className="admin-main"><div className="admin-content max-w-4xl"><Link className="font-semibold text-violet-700" href={`/app/${escola}/dashboard`}>← Voltar ao painel</Link><p className="eyebrow mt-8">ROTINA DA TURMA</p><h1 className="font-display text-3xl font-bold">Frequência</h1><p className="mt-2 text-slate-600">Registros não selecionados permanecem sem chamada. Ajustes são gravados por criança e data.</p>{query.salva && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-emerald-900">Chamada salva com sucesso.</p>}{classroom ? <form action={`/api/app/${escola}/frequencia`} method="post" className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><input type="hidden" name="classroomId" value={classroom.id}/><label className="field-label mb-5 max-w-xs">Data letiva<input className="field-input" name="classDate" type="date" defaultValue={date} required/></label><ul className="divide-y divide-slate-100">{students.map((entry)=><li key={entry.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_14rem] sm:items-center"><strong>{entry.student.displayName}</strong><label className="sr-only" htmlFor={`status-${entry.id}`}>Frequência de {entry.student.displayName}</label><select id={`status-${entry.id}`} name={`status:${entry.id}`} className="field-input"><option value="">Não registrado</option>{Object.values(AttendanceStatus).map((status)=><option value={status} key={status} selected={entry.attendance[0]?.status===status}>{status === "PRESENT" ? "Presente" : status === "ABSENT" ? "Ausente" : status === "LATE" ? "Atraso" : "Justificada"}</option>)}</select></li>)}</ul><button className="button-primary mt-5">Salvar chamada</button></form> : <p className="mt-6 rounded-2xl bg-amber-50 p-5">Nenhuma turma autorizada.</p>}</div></main></div>;
}
