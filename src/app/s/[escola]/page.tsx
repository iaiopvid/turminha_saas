import Link from "next/link";
import { Camera, Heart, Images, Sparkles, Star, Sun } from "lucide-react";
import { notFound } from "next/navigation";
import { getPublicClassroom } from "@/server/tenancy/repositories";

export const dynamic = "force-dynamic";

export default async function ClassroomPage({ params }: { params: Promise<{ escola: string }> }) {
  const { escola } = await params;
  const data = await getPublicClassroom(escola);
  if (!data) notFound();
  const notice = data.notices[0];
  const categoryNames: Record<string, string> = { ACTIVITY: "Atividades", PLAY: "Brincadeiras", EVENT: "Festas" };
  return (
    <div className="classroom-world min-h-screen overflow-hidden text-slate-700">
      <div className="world-decor" aria-hidden="true"><span className="world-sun"><Sun/></span><span className="world-cloud cloud-one">☁</span><span className="world-cloud cloud-two">☁</span><span className="world-star star-one">✦</span><span className="world-star star-two">✦</span><span className="world-butterfly">🦋</span></div>
      <header className="sticky top-0 z-20 border-b-4 border-yellow-300 bg-white/90 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-3 md:flex-row">
          <Link href={`/s/${escola}`} className="flex items-center gap-3">
            <span className="brand-mark"><Sparkles/></span>
            <span><span className="block font-display text-2xl font-bold text-pink-500">{data.school?.displayClass}</span><span className="block text-xs font-semibold text-sky-700">{data.school?.name} · {data.school?.displayTeam}</span></span>
          </Link>
          <nav aria-label="Navegação da turma" className="flex flex-wrap justify-center gap-2 font-display text-sm font-bold">
            <a className="nav-pill nav-yellow" href="#inicio">Início</a><a className="nav-pill nav-green" href="#turma">Nossa Turma</a><a className="nav-pill nav-purple" href="#galeria">Galeria</a><a className="nav-pill nav-pink" href="#titias">Titias</a><Link className="nav-pill nav-blue" href={`/entrar?tenant=${escola}`}>Entrar</Link>
          </nav>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6">
        <section id="inicio" className="glass-panel relative overflow-hidden border-yellow-200 px-6 py-9 text-center sm:p-12">
          <div className="absolute -left-8 -top-8 h-36 w-36 rounded-full bg-yellow-200/60 blur-2xl"/><div className="absolute -bottom-8 -right-8 h-40 w-40 rounded-full bg-pink-200/60 blur-2xl"/>
          <span className="relative inline-flex items-center gap-2 rounded-full border border-pink-200 bg-pink-50 px-4 py-2 font-display text-sm font-semibold text-pink-600">🎈 Um ano de descobertas e carinho 🎨</span>
          <h1 className="relative mt-4 font-display text-4xl font-bold leading-tight sm:text-6xl">Bem-vindos ao <span className="text-pink-500">Mundo Mágico</span>!</h1>
          <p className="relative mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">Cada dia traz novas cores, histórias e brincadeiras. Este espaço aproxima escola e família, respeitando a privacidade de cada criança.</p>
          <div className="relative mt-6 flex flex-wrap justify-center gap-3"><a href="#turma" className="button-warm">Conhecer a turminha <Star size={17}/></a><a href="#galeria" className="button-violet">Ver lembranças <Images size={17}/></a></div>
        </section>
        <section className="grid gap-5 md:grid-cols-3">
          <article className="glass-panel border-l-8 border-pink-400 md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-dashed border-slate-200 pb-3"><h2 className="section-title"><span className="icon-bubble bg-pink-100 text-pink-500">♡</span>Mural do Dia das Titias</h2><span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600">{notice?.publishedAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: data.school?.timezone }).format(notice.publishedAt) : "Boas-vindas"}</span></div>
            {notice ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-5"><h3 className="font-display text-lg font-bold text-amber-900">{notice.title}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6">{notice.body}</p></div> : <p className="mt-4 rounded-2xl bg-sky-50 p-5 text-sm">As professoras ainda não publicaram um recado. Volte em breve para novas novidades! ✨</p>}
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold"><span className="rounded-2xl bg-sky-50 p-3 text-sky-700">🎨<br/>Artes &amp; Cores</span><span className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">♫<br/>Cantigas &amp; Rodas</span><span className="rounded-2xl bg-purple-50 p-3 text-purple-700">✧<br/>Jogos Lúdicos</span></div>
          </article>
          <aside className="glass-panel border-t-8 border-yellow-400"><h2 className="section-title"><span className="icon-bubble bg-yellow-100 text-amber-500">✦</span>Nosso Cantinho</h2><p className="mt-3 text-sm leading-6">Um lugar para brincar, explorar e aprender junto. A identidade e os conteúdos pertencem a cada escola.</p><div className="mt-4 rounded-2xl border border-slate-100 bg-white p-3 text-sm">Pequenos matriculados <strong className="float-right font-display text-lg text-amber-500">{data.studentCount}</strong></div><div className="mt-2 rounded-2xl border border-slate-100 bg-white p-3 text-sm">Lembranças publicadas <strong className="float-right font-display text-lg text-violet-500">{data.gallery.length}</strong></div><p className="mt-3 text-xs text-slate-500">Nomes e fotos de alunos não são públicos por padrão.</p></aside>
        </section>
        <section id="turma" className="glass-panel text-center"><h2 className="font-display text-3xl font-bold">🧸 Nossa Turma</h2><p className="mt-2 text-sm text-slate-600">Um cantinho cheio de descobertas e amizade.</p><div className="mx-auto mt-5 max-w-xl rounded-3xl border-2 border-dashed border-yellow-300 bg-white/70 p-6"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-sky-100 text-3xl">🌈</div><p className="mt-3 text-sm font-medium">Os perfis individuais aparecem somente quando a escola autoriza a publicação.</p></div></section>
        <section id="galeria" className="glass-panel"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="section-title"><span className="icon-bubble bg-violet-100 text-violet-600"><Camera/></span>Galeria Coletiva</h2><p className="mt-2 text-sm">Lembranças revisadas e compartilhadas pela escola.</p></div><div className="flex flex-wrap gap-2" aria-label="Filtros de galeria">{["Todas", "Atividades", "Brincadeiras", "Festas"].map((label, i) => <a key={label} href="#galeria" className={`rounded-2xl px-3 py-2 text-xs font-bold ${i === 0 ? "bg-pink-500 text-white" : "bg-white text-slate-700"}`}>{label}</a>)}</div></div>
          {data.gallery.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.gallery.map((item) => <article key={item.id} className="overflow-hidden rounded-3xl border-4 border-white bg-white shadow"><div className="grid h-44 place-items-center bg-gradient-to-br from-sky-100 via-pink-50 to-amber-100 text-5xl">🌈</div><div className="p-4"><span className="text-xs font-semibold text-violet-600">{categoryNames[item.category]}</span><h3 className="font-display font-bold">{item.title}</h3></div></article>)}</div> : <div className="mt-5 rounded-3xl border-2 border-dashed border-purple-200 bg-white/70 p-8 text-center"><span className="text-4xl">📸</span><p className="mt-3 font-display font-semibold">Ainda não há lembranças publicadas.</p><p className="mt-1 text-sm text-slate-500">As fotos só aparecem depois da revisão e das autorizações necessárias.</p></div>}
          <div className="mt-5 text-center"><button className="button-soft" disabled aria-label="Carregar mais lembranças">Carregar mais lembranças</button><p className="mt-2 text-xs text-slate-500">{data.gallery.length === 0 ? "Você chegou ao fim das lembranças" : "Mostrando as lembranças mais recentes"}</p></div>
        </section>
        <section id="titias" className="rounded-[2rem] border-4 border-white bg-gradient-to-br from-pink-100 via-white to-violet-100 p-7 text-center shadow-lg"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-pink-500 shadow"><Heart/></div><h2 className="mt-3 font-display text-3xl font-bold">Cantinho das Titias</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6">Nossa equipe compartilha cuidado, curiosidade e muitas histórias. As informações exibidas são configuradas pela escola.</p><p className="mt-3 font-display font-semibold text-violet-700">{data.school?.displayTeam}</p><Link className="mt-5 inline-flex text-sm font-bold text-violet-700 underline" href={`/familia/${escola}`}>Acessar o espaço da família</Link></section>
      </main>
      <footer className="relative z-10 border-t-4 border-white bg-white/70 px-4 py-6 text-center text-sm">Feito com carinho pela <strong className="font-display text-pink-600">Turminha</strong> · {data.school?.name}</footer>
    </div>
  );
}
