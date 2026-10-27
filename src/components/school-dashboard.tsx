import Link from "next/link";
import { ArrowRight, Bell, BookOpenCheck, CalendarCheck, Camera, Heart, MessageCircle, Users } from "lucide-react";
import type { TenantContext } from "@/server/tenancy/context";
import { AdminSidebar } from "@/components/admin-sidebar";
import { getTeacherDashboard } from "@/server/tenancy/repositories";

const shortStatus: Record<string, { text: string; className: string }> = {
  PRESENT: { text: "Presente", className: "status-present" },
  ABSENT: { text: "Ausente", className: "status-absent" },
  LATE: { text: "Atraso", className: "status-late" },
  EXCUSED: { text: "Justificada", className: "status-absent" },
};

export async function SchoolDashboard({ context, classroomId }: { context: TenantContext; classroomId?: string }) {
  const data = await getTeacherDashboard(context, classroomId);
  if (!data) return <main className="access-denied"><h1>Acesso restrito</h1><p>Seu vínculo não permite abrir o painel da turma.</p></main>;
  const currentHour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hourCycle: "h23", timeZone: context.timezone }).format(new Date()));
  const greeting = currentHour < 12 ? "Bom dia" : currentHour < 18 ? "Boa tarde" : "Boa noite";
  const selected = data.classroom;
  return <div className="admin-shell">
    <AdminSidebar slug={context.tenantSlug} active="dashboard" schoolName={context.schoolName} displayName={context.displayName}/>
    <main className="admin-main">
      <header className="admin-topbar"><div><span className="topbar-label">ESPAÇO DA ESCOLA</span><p>{context.schoolName} {selected ? `· ${selected.name} · ${selected.schoolYear}` : "· Sem turma atribuída"}</p></div><div className="topbar-actions"><span className="today-chip">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: context.timezone }).format(new Date())}</span><button className="notification-button" aria-label="Notificações"><Bell size={19}/></button><span className="topbar-avatar">{context.displayName.slice(0,1).toUpperCase()}</span></div></header>
      <div className="admin-content">
        <div className="dashboard-heading"><div><p className="eyebrow">UM NOVO DIA DE DESCOBERTAS</p><h1>{greeting}, {context.displayName.split(" ")[0]} <Heart className="inline text-pink-500" size={23}/></h1><p className="muted">Aqui está o que acontece na sua turma hoje.</p></div>{selected && <form action={`/app/${context.tenantSlug}/dashboard`} method="get" className="class-select-label"><label htmlFor="classroomId">Contexto da turma</label><div className="flex items-center gap-2"><select id="classroomId" name="classroomId" className="class-select" defaultValue={selected.id} aria-label="Turma atual">{data.classrooms.map((item)=><option key={item.id} value={item.id}>{item.name} · {item.schoolYear}</option>)}</select><button className="button-secondary" type="submit">Abrir</button></div></form>}</div>
        {!selected ? <section className="empty-state"><Users size={34}/><h2>Nenhuma turma atribuída</h2><p>Quando a escola vincular você a uma turma, os registros autorizados aparecerão aqui.</p></section> : <>
          <section className="metric-grid" aria-label="Indicadores da turma">
            <Metric icon={<Users/>} tone="violet" label="Alunos" value={data.metrics.students} note="matrículas ativas"/>
            <Metric icon={<CalendarCheck/>} tone="green" label="Presença hoje" value={data.metrics.marked ? `${data.metrics.present}/${data.metrics.students}` : `—/${data.metrics.students}`} note={data.metrics.marked ? `${data.metrics.absent} ausências · chamada parcial` : "Não registrado"}/>
            <Metric icon={<MessageCircle/>} tone="pink" label="Mensagens" value="—" note="Módulo não configurado"/>
            <Metric icon={<Camera/>} tone="blue" label="Fotos adicionadas" value={data.metrics.photosToday} note="hoje · mídia escolar disponível"/>
          </section>
          <section className="dashboard-middle">
            <article className="dashboard-card updates-card"><div className="card-heading"><h2><span className="heading-icon violet"><BookOpenCheck size={19}/></span>Atualizações de hoje</h2><Link href={`/app/${context.tenantSlug}/diario`}>Ver registros <ArrowRight size={15}/></Link></div>{data.notice ? <div className="update-entry"><p className="update-kind">Recado da turma</p><h3>{data.notice.title}</h3><p>{data.notice.body}</p>{data.notice.publishedAt && <time dateTime={data.notice.publishedAt.toISOString()}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: context.timezone }).format(data.notice.publishedAt)}</time>}</div> : <div className="dashboard-empty"><span>📝</span><div><strong>Sem atualizações registradas</strong><p>Os novos registros persistidos aparecerão neste espaço.</p></div></div>}<div className="update-media-empty"><span>🌤️</span><p>As miniaturas aparecerão quando houver mídia escolar revisada.</p></div></article>
            <article className="dashboard-card quick-card"><div className="card-heading"><h2><span className="heading-icon amber">✦</span>Ações rápidas</h2></div><div className="quick-actions"><Quick href={`/app/${context.tenantSlug}/comunicados`} color="lavender" icon={<MessageCircle/>} label="Enviar recado"/><Quick href={`/app/${context.tenantSlug}/midias`} color="rose" icon={<Camera/>} label="Adicionar fotos"/><Quick href={`/app/${context.tenantSlug}/relatorio-do-dia`} color="sky" icon={<BookOpenCheck/>} label="Relatório do dia"/><Quick href={`/app/${context.tenantSlug}/frequencia`} color="mint" icon={<CalendarCheck/>} label="Fazer chamada"/></div></article>
          </section>
          <section className="dashboard-card attendance-card"><div className="card-heading"><h2><span className="heading-icon violet"><Users size={19}/></span>Frequência da turma</h2><Link href={`/app/${context.tenantSlug}/frequencia`}>Ver chamada <ArrowRight size={15}/></Link></div>{data.students.length ? <ul className="attendance-list">{data.students.slice(0,12).map((student) => { const status = student.status ? shortStatus[student.status] : { text: "Não registrado", className: "status-unmarked" }; return <li key={student.id}><span className="student-avatar">{student.name.slice(0,1).toUpperCase()}</span><span className="student-short-name">{student.name.split(" ")[0]}</span><span className={`attendance-status ${status.className}`}>{status.text}</span></li>; })}</ul> : <div className="dashboard-empty"><span>🌈</span><p>A turma ainda não tem matrículas ativas neste período.</p></div>}{data.students.length > 12 && <Link className="show-more" href={`/app/${context.tenantSlug}/frequencia`}>Ver as {data.metrics.students} crianças <ArrowRight size={15}/></Link>}</section>
        </>}
        <p className="demo-note">Ambiente de demonstração · pessoas e registros fictícios · conteúdo limitado ao vínculo autenticado.</p>
      </div>
    </main>
  </div>;
}

function Metric({ icon, tone, label, value, note }: { icon: React.ReactNode; tone: string; label: string; value: string | number; note: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong className={`metric-value ${tone}`}>{value}</strong><small>{note}</small></div></article>;
}

function Quick({ href, color, icon, label }: { href: string; color: string; icon: React.ReactNode; label: string }) {
  return <Link className={`quick-action ${color}`} href={href}><span>{icon}</span><strong>{label}</strong><ArrowRight size={17}/></Link>;
}
