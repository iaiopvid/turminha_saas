import Link from "next/link";
import { redirect } from "next/navigation";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";
import { domainVerificationValue } from "@/server/tenancy/domains";
import { AdminSidebar } from "@/components/admin-sidebar";

export const dynamic = "force-dynamic";

export default async function SchoolSettingsPage({ params, searchParams }: {
  params: Promise<{ escola: string }>;
  searchParams: Promise<{ saved?: string; error?: string; domain?: string }>;
}) {
  const { escola } = await params;
  const query = await searchParams;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN]); }
  catch (error) { if (error instanceof ContextError && error.status === 401) redirect(`/entrar?tenant=${encodeURIComponent(escola)}`); return <main className="access-denied"><h1>Acesso restrito</h1><p>Somente a administração da escola pode alterar estas configurações.</p></main>; }
  const school = await prisma.school.findUniqueOrThrow({
    where: { tenantId: context.tenantId },
    select: { name: true, displayClass: true, displayTeam: true, timezone: true, publicStudents: true, brandPrimary: true, brandAccent: true },
  });
  const domains = await prisma.tenantDomain.findMany({ where: { tenantId: context.tenantId }, select: { id: true, hostname: true, verificationToken: true, status: true, verifiedAt: true }, orderBy: { createdAt: "asc" } });
  const domainMessages: Record<string, string> = { pending: "Dominio reservado para verificacao.", verified: "Controle do dominio confirmado e ativo.", removed: "Dominio removido apos nova prova de controle.", "proof-missing": "Prova TXT nao encontrada. Confira o registro e a propagacao.", unavailable: "Este dominio nao esta disponivel para esta escola.", invalid: "Informe um dominio completo valido.", reserved: "O host da plataforma nao pode ser associado como dominio personalizado.", changed: "O estado mudou. Atualize a pagina e confira a lista." };

  return <div className="admin-shell"><AdminSidebar slug={escola} active="configuracoes" schoolName={context.schoolName} displayName={context.displayName}/><main className="admin-main"><div className="admin-content max-w-4xl">
    <div className="dashboard-heading"><div><p className="eyebrow">ADMINISTRAÇÃO DA ESCOLA</p><h1>Configurações</h1><p className="muted">Preferências da escola que controlam sua identificação e uma opção de privacidade do portal público.</p></div></div>
    {query.saved && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-emerald-900">Configurações salvas.</p>}
    {query.error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-rose-900">Não foi possível salvar. Confira os campos e use um fuso horário IANA válido.</p>}
    <form action={`/api/app/${encodeURIComponent(escola)}/configuracoes`} method="post" className="dashboard-card grid gap-5">
      <label className="field-label">Nome da escola<input className="field-input" name="name" required minLength={2} maxLength={140} defaultValue={school.name}/></label>
      <label className="field-label">Nome público da turma<input className="field-input" name="displayClass" required minLength={2} maxLength={100} defaultValue={school.displayClass}/><span className="font-normal text-slate-500">Usado no cabeçalho do espaço público da escola.</span></label>
      <label className="field-label">Equipe pedagógica<input className="field-input" name="displayTeam" required minLength={2} maxLength={180} defaultValue={school.displayTeam}/></label>
      <label className="field-label">Fuso horário<input className="field-input" name="timezone" required maxLength={80} defaultValue={school.timezone} placeholder="America/Sao_Paulo"/><span className="font-normal text-slate-500">Informe um identificador IANA, por exemplo `America/Sao_Paulo`.</span></label>
      <fieldset className="grid gap-4 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2"><legend className="px-2 text-sm font-bold">Identidade visual</legend><label className="field-label">Cor principal<input className="field-input h-14 cursor-pointer p-2" type="color" name="brandPrimary" defaultValue={school.brandPrimary}/></label><label className="field-label">Cor de destaque<input className="field-input h-14 cursor-pointer p-2" type="color" name="brandAccent" defaultValue={school.brandAccent}/></label><p className="text-sm font-normal text-slate-600 sm:col-span-2">As cores são aplicadas somente à identidade desta escola. Logotipos externos e código CSS não são aceitos.</p></fieldset>
      <fieldset className="rounded-2xl border border-slate-200 p-4"><legend className="px-2 text-sm font-bold">Portal público</legend><input type="hidden" name="publicStudents" value="false"/><label className="flex items-start gap-3"><input className="mt-1 size-4 accent-violet-700" type="checkbox" name="publicStudents" value="true" defaultChecked={school.publicStudents}/><span><strong className="block text-sm">Exibir o total de matrículas ativas</strong><span className="mt-1 block text-sm text-slate-600">Exibe somente uma contagem agregada no espaço público. Nomes, fotos e perfis individuais continuam privados.</span></span></label></fieldset>
      <div className="flex flex-wrap items-center gap-3"><button className="button-primary">Salvar configurações</button><Link className="button-secondary" href={`/s/${encodeURIComponent(escola)}`}>Ver espaço público</Link></div>
    </form>
    <section className="dashboard-card mt-5 grid gap-4" aria-labelledby="domain-heading">
      <div><h2 id="domain-heading" className="font-display text-xl font-bold">Dominios da escola</h2><p className="mt-1 text-sm text-slate-600">O dominio direciona para esta escola somente apos prova de controle por DNS TXT. Hosts desconhecidos sao bloqueados.</p></div>
      {query.domain && <p role={query.domain === "verified" || query.domain === "removed" || query.domain === "pending" ? "status" : "alert"} className="rounded-xl bg-violet-50 p-3 text-sm text-violet-950">{domainMessages[query.domain] ?? "Unable to update domain."}</p>}
      <form action={`/api/app/${encodeURIComponent(escola)}/dominios`} method="post" className="flex flex-wrap items-end gap-3 rounded-2xl bg-slate-50 p-4"><input type="hidden" name="action" value="start"/><label className="field-label min-w-64 flex-1">Dominio completo<input className="field-input" name="hostname" required maxLength={253} placeholder="turma.suaescola.com.br"/></label><button className="button-primary">Adicionar dominio</button></form>
      {domains.length === 0 ? <p className="text-sm text-slate-500">Nenhum dominio personalizado cadastrado.</p> : <ul className="grid gap-3">{domains.map((domain) => <li key={domain.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{domain.hostname}</strong><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{domain.status === "VERIFIED" ? "Verificado" : "Pendente"}</span></div>{domain.status === "PENDING" ? <><p className="mt-2 text-sm text-slate-600">Crie um registro TXT em <code>{domain.hostname}</code> com este valor:</p><code className="mt-2 block break-all rounded-xl bg-slate-50 p-3 text-sm">{domainVerificationValue(domain.verificationToken)}</code><form action={`/api/app/${encodeURIComponent(escola)}/dominios`} method="post" className="mt-3"><input type="hidden" name="action" value="verify"/><input type="hidden" name="domainId" value={domain.id}/><button className="button-secondary">Verificar DNS</button></form></> : <><p className="mt-2 text-sm text-slate-600">Verificado em {domain.verifiedAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: school.timezone }).format(domain.verifiedAt) : "data indisponivel"}. Mantenha a prova TXT publicada para remover ou transferir este dominio.</p><form action={`/api/app/${encodeURIComponent(escola)}/dominios`} method="post" className="mt-3"><input type="hidden" name="action" value="remove"/><input type="hidden" name="domainId" value={domain.id}/><button className="button-secondary">Remover com prova DNS</button></form></>}</li>)}</ul>}
    </section>
  </div></main></div>;
}
