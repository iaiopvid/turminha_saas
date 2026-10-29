import Link from "next/link";
import { ArrowRight, Heart, Sparkles } from "lucide-react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isPlatformHostname, normalizeRequestHostname, resolveVerifiedDomain } from "@/server/tenancy/domains";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const hostname = normalizeRequestHostname((await headers()).get("host"));
  if (!hostname) notFound();
  if (!isPlatformHostname(hostname)) {
    const tenant = await resolveVerifiedDomain(hostname);
    if (!tenant) notFound();
    redirect(`/s/${encodeURIComponent(tenant.slug)}`);
  }
  return (
    <main className="min-h-screen bg-[#e0f7fa] px-5 py-16 text-slate-800">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] border-4 border-white bg-white/90 p-8 shadow-xl md:p-14">
        <p className="font-display text-sm font-bold uppercase tracking-[.2em] text-pink-500">Turminha · Jardim de memórias</p>
        <h1 className="mt-4 max-w-3xl font-display text-5xl font-bold leading-tight md:text-7xl">Menos burocracia. <span className="text-violet-600">Mais descobertas.</span></h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">Um espaço acolhedor para a rotina escolar, os registros pedagógicos e as lembranças que aproximam as famílias.</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link className="button-primary" href="/s/colegio-pilares-demo">Conhecer a turma <ArrowRight size={18}/></Link>
          <Link className="button-secondary" href="/entrar?tenant=colegio-pilares-demo">Entrar na minha conta</Link>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {["Planejamento com propósito", "Registros com contexto", "Memórias com privacidade"].map((item, index) => <div className="rounded-3xl bg-sky-50 p-5" key={item}><span className="mb-3 inline-flex rounded-2xl bg-white p-3 text-pink-500">{index === 0 ? <Sparkles/> : <Heart/>}</span><h2 className="font-display text-lg font-bold">{item}</h2></div>)}
        </div>
        <p className="mt-8 text-xs text-slate-500">As páginas de demonstração são fictícias e usam conteúdo sem identificação de crianças reais.</p>
      </div>
    </main>
  );
}
