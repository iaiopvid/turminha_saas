import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionPrincipal } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";

type Props = { searchParams: Promise<{ tenant?: string; error?: string; limit?: string; next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const query = await searchParams;
  const tenantSlug = query.tenant ?? "";
  if (await getSessionPrincipal()) redirect(tenantSlug ? `/s/${tenantSlug}` : "/");
  const tenant = tenantSlug ? await prisma.tenant.findFirst({ where: { slug: tenantSlug, status: "ACTIVE" }, select: { school: { select: { name: true, displayClass: true } } } }) : null;
  return (
    <main className="min-h-screen bg-[#e0f7fa] px-4 py-12">
      <section className="mx-auto max-w-md rounded-[2rem] border-4 border-white bg-white/95 p-7 shadow-xl sm:p-9">
        <Link href={tenantSlug ? `/s/${tenantSlug}` : "/"} className="text-sm font-semibold text-violet-700">← Voltar</Link>
        <p className="mt-6 font-display text-sm font-bold uppercase tracking-widest text-pink-500">Turminha</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Que bom ter você aqui!</h1>
        <p className="mt-2 text-sm text-slate-600">Entre com sua conta adulta{tenant?.school ? ` para ${tenant.school.name}` : ""}. Seus vínculos definem o que você pode ver.</p>
        {query.error && <p role="alert" className="mt-5 rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">Não foi possível entrar com esses dados. Confira o acesso à escola e tente novamente.</p>}
        {query.limit && <p role="alert" className="mt-5 rounded-2xl bg-amber-50 p-3 text-sm text-amber-950">Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.</p>}
        {!tenant && <p className="mt-5 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">Escolha uma escola válida antes de entrar.</p>}
        <form action="/api/auth/signin" method="post" className="mt-6 space-y-4">
          <input type="hidden" name="tenant" value={tenantSlug}/>
          <label className="field-label">E-mail<input className="field-input" name="email" type="email" autoComplete="username" required maxLength={254}/></label>
          <label className="field-label">Senha<input className="field-input" name="password" type="password" autoComplete="current-password" required maxLength={128}/></label>
          <button className="button-primary w-full" disabled={!tenant}>Entrar com segurança</button>
        </form>
        <p className="mt-5 text-xs leading-5 text-slate-500">O acesso depende de um vínculo vigente com a escola. Recuperação de acesso e convites serão habilitados na etapa de identidade completa.</p>
      </section>
    </main>
  );
}
