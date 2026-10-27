import { redirect } from "next/navigation";
import Link from "next/link";
import { EnrollmentStatus, MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";
import { AdminSidebar } from "@/components/admin-sidebar";

export const dynamic = "force-dynamic";
const steps = [
  { id: "school", title: "Configure a escola", description: "Nome, turma exibida e fuso horário." },
  { id: "unit", title: "Cadastre uma unidade", description: "Organize locais que compartilham o tenant escolar." },
  { id: "year", title: "Defina o ano letivo", description: "Intervalo e datas no calendário." },
  { id: "classroom", title: "Abra uma turma", description: "Ano, unidade e capacidade." },
  { id: "staff", title: "Vincule a equipe", description: "Convide equipe e associe-a às turmas." },
  { id: "students", title: "Cadastre estudantes", description: "Matrículas e lista de espera." },
  { id: "guardians", title: "Vincule responsáveis", description: "Envie convite e aguarde aceitação do vínculo." },
  { id: "policies", title: "Revise as políticas", description: "Documente responsáveis, consentimentos e publicação." },
  { id: "first-record", title: "Faça o primeiro registro", description: "Publique um comunicado ou registre a chamada." },
] as const;

export default async function OnboardingPage({ params, searchParams }: { params: Promise<{ escola: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { escola } = await params; const query = await searchParams;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR]); }
  catch (error) { if (error instanceof ContextError && error.status === 401) redirect(`/entrar?tenant=${encodeURIComponent(escola)}`); return <main className="access-denied">Implantação restrita à gestão escolar.</main>; }
  const [school, unitCount, yearCount, classCount, staffCount, studentCount, guardianCount, announcementCount, attendanceCount, saved] = await Promise.all([
    prisma.school.findFirst({ where: { tenantId: context.tenantId }, select: { name: true } }),
    prisma.schoolUnit.count({ where: { tenantId: context.tenantId, active: true } }),
    prisma.schoolYear.count({ where: { tenantId: context.tenantId } }),
    prisma.classroom.count({ where: { tenantId: context.tenantId, status: EnrollmentStatus.ACTIVE } }),
    prisma.classroomStaff.count({ where: { tenantId: context.tenantId } }),
    prisma.enrollment.count({ where: { tenantId: context.tenantId, status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.WAITLISTED] } } }),
    prisma.studentGuardian.count({ where: { tenantId: context.tenantId, approved: true, revokedAt: null } }),
    prisma.announcement.count({ where: { tenantId: context.tenantId, visibility: "PUBLISHED" } }),
    prisma.attendance.count({ where: { tenantId: context.tenantId } }),
    prisma.onboardingProgress.findMany({ where: { tenantId: context.tenantId }, select: { step: true, completedAt: true } }),
  ]);
  const inferred: Record<string, boolean> = { school: !!school, unit: unitCount > 0, year: yearCount > 0, classroom: classCount > 0, staff: staffCount > 0, students: studentCount > 0, guardians: guardianCount > 0, "first-record": announcementCount + attendanceCount > 0 };
  const marked = new Set(saved.filter((item) => item.completedAt).map((item) => item.step));
  const doneCount = steps.filter((step) => inferred[step.id] || marked.has(step.id)).length;
  return <div className="admin-shell"><AdminSidebar slug={escola} active="gestao-escolar" schoolName={context.schoolName} displayName={context.displayName}/><main className="admin-main"><div className="admin-content max-w-4xl"><Link href={`/app/${escola}/gestao-escolar`} className="font-semibold text-violet-700">← Gestão escolar</Link><p className="eyebrow mt-8">IMPLANTAÇÃO SALVA</p><h1 className="font-display text-3xl font-bold">Continue de onde parou</h1><p className="mt-2 text-slate-600">Seu progresso permanece associado a esta escola e pode ser retomado depois. {doneCount} de {steps.length} etapas concluídas.</p>
    {query.saved && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-emerald-900">Progresso salvo.</p>}{query.error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-rose-800">Não foi possível salvar essa etapa.</p>}
    <ol className="mt-6 space-y-3">{steps.map((step, index) => { const complete = inferred[step.id] || marked.has(step.id); return <li key={step.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start gap-3"><span className={`grid h-8 w-8 flex-none place-items-center rounded-full font-bold ${complete ? "bg-emerald-100 text-emerald-800" : "bg-violet-100 text-violet-800"}`}>{complete ? "✓" : index + 1}</span><div><h2 className="font-bold">{step.title}</h2><p className="text-sm text-slate-600">{step.description}</p></div></div><form action={`/api/app/${escola}/gestao-escolar/onboarding`} method="post"><input type="hidden" name="step" value={step.id}/><input type="hidden" name="completed" value={complete ? "false" : "true"}/><button className="button-secondary">{complete ? "Reabrir etapa" : "Marcar concluída"}</button></form></li>; })}</ol>
  </div></main></div>;
}
