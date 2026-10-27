import { redirect } from "next/navigation";
import Link from "next/link";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { AdminSidebar } from "@/components/admin-sidebar";
import { StudentCsvImport } from "@/components/student-csv-import";

export const dynamic = "force-dynamic";

export default async function ImportStudentsPage({ params }: { params: Promise<{ escola: string }> }) {
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR]); }
  catch (error) { if (error instanceof ContextError && error.status === 401) redirect(`/entrar?tenant=${encodeURIComponent(escola)}`); return <main className="access-denied">Importação restrita à gestão escolar.</main>; }
  return <div className="admin-shell"><AdminSidebar slug={escola} active="gestao-escolar" schoolName={context.schoolName} displayName={context.displayName}/><main className="admin-main"><div className="admin-content max-w-6xl"><Link href={`/app/${escola}/gestao-escolar`} className="font-semibold text-violet-700">← Gestão escolar</Link><p className="eyebrow mt-8">IMPORTAÇÃO ASSISTIDA</p><h1 className="font-display text-3xl font-bold">Importar estudantes e vínculos</h1><p className="mt-2 max-w-3xl text-slate-600">Pré-visualize, valide e corrija o lote antes de confirmar. Estudantes excedentes à capacidade entram na lista de espera. Convites são criados sem enviar e-mail.</p><details className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4"><summary className="cursor-pointer font-bold text-violet-950">Como preencher as colunas</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700"><li><code>record_type</code>: <code>student</code>, <code>guardian</code> ou <code>staff</code>. <code>source_id</code> é um identificador estável e único por tipo de registro.</li><li><code>student</code>: preencha nome, ano letivo e nome exato da turma ativa; deixe e-mail, <code>student_source_id</code> e <code>role</code> vazios.</li><li><code>guardian</code>: preencha nome, e-mail e em <code>student_source_id</code> informe o <code>source_id</code> do estudante no mesmo CSV ou já importado; papel será GUARDIAN.</li><li><code>staff</code>: preencha nome, e-mail, ano letivo, turma e <code>role</code> como <code>TEACHER</code> ou <code>ASSISTANT</code>; deixe <code>student_source_id</code> vazio.</li></ul></details><StudentCsvImport endpoint={`/api/app/${encodeURIComponent(escola)}/gestao-escolar/importacao`}/></div></main></div>;
}
