import { redirect } from "next/navigation";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { listAuthorizedClassrooms } from "@/server/tenancy/repositories";
import { prisma } from "@/server/db/prisma";
import { getMediaReviewPage } from "@/server/tenancy/media-review-repository";
import { AdminSidebar } from "@/components/admin-sidebar";
import { BulkMediaReview } from "@/components/bulk-media-review";

export const dynamic = "force-dynamic";

const mediaRoles = [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR, MembershipRole.TEACHER, MembershipRole.ASSISTANT];
const reviewStatusLabel: Record<string, string> = { SUBMITTED: "Enviado à escola", UNDER_REVIEW: "Em revisão", APPROVED: "Aprovado para uso escolar", CHANGES_REQUESTED: "Ajustes solicitados", REJECTED: "Não aprovado", WITHDRAWN: "Retirado" };
function reviewPageHref(escola: string, page: number, filters: Record<string, string>) {
  const query = new URLSearchParams({ page: String(page) });
  for (const [key, value] of Object.entries(filters)) if (value && key !== "page") query.set(key, value);
  return `/app/${encodeURIComponent(escola)}/midias?${query.toString()}`;
}

export default async function MediaManagementPage({ params, searchParams }: { params: Promise<{ escola: string }>; searchParams: Promise<{ uploaded?: string; pendingScan?: string; infected?: string; infectedCleanupPending?: string; invalid?: string; error?: string; review?: string; page?: string; status?: string; classroomId?: string; studentId?: string; authorId?: string; from?: string; to?: string }> }) {
  const { escola } = await params;
  const query = await searchParams;
  let context;
  try { context = await resolveTenantContext(escola, mediaRoles); }
  catch (error) {
    if (error instanceof ContextError && error.status === 401) redirect(`/entrar?tenant=${encodeURIComponent(escola)}`);
    return <main className="access-denied">Acesso restrito à equipe escolar.</main>;
  }

  const classrooms = await listAuthorizedClassrooms(context);
  const media = classrooms.length ? await prisma.mediaAsset.findMany({
    where: { tenantId: context.tenantId, classroomId: { in: classrooms.map((item) => item.id) } },
    select: { id: true, title: true, category: true, originalFilename: true, scanStatus: true, status: true, createdAt: true, classroom: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  }) : [];
  const review = await getMediaReviewPage(context, classrooms, query);

  return <div className="admin-shell">
    <AdminSidebar slug={escola} active="midias" schoolName={context.schoolName} displayName={context.displayName}/>
    <main className="admin-main"><div className="admin-content max-w-6xl">
      <p className="eyebrow mt-8">MEMÓRIAS DA TURMA</p>
      <h1 className="font-display text-3xl font-bold">Arquivos privados da escola</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Envios ficam privados e em quarentena até a verificação de segurança. Eles não são publicados para as famílias por este fluxo.</p>

      {query.uploaded && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-emerald-900">Arquivo verificado e aguardando curadoria da equipe.</p>}
      {query.pendingScan && <p role="status" className="mt-5 rounded-xl bg-amber-50 p-3 text-amber-950">Arquivo guardado em quarentena. A verificação ClamAV não está disponível; nenhum download será liberado.</p>}
      {query.infected && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-rose-900">A verificação identificou conteúdo inseguro. O arquivo foi bloqueado.</p>}
      {query.infectedCleanupPending && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-rose-900">A verificação identificou conteúdo inseguro. O acesso foi bloqueado, mas a remoção física está pendente; acione a operação de storage.</p>}
      {query.invalid && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-rose-900">Confira turma, título e imagem (JPEG, PNG ou WebP, até 5 MB).</p>}
      {query.error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-rose-900">O armazenamento privado não está disponível. O arquivo não foi recebido.</p>}
      {query.review && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-emerald-900">A decisão editorial foi registrada. Aprovação não publica o conteúdo.</p>}

      <form action={`/api/app/${encodeURIComponent(escola)}/midias`} method="post" encType="multipart/form-data" className="mt-6 grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
        <label className="field-label">Turma<select className="field-input" name="classroomId" required defaultValue=""><option value="" disabled>Selecione uma turma autorizada</option>{classrooms.map((classroom) => <option value={classroom.id} key={classroom.id}>{classroom.name} · {classroom.schoolYear}</option>)}</select></label>
        <label className="field-label">Título<input className="field-input" name="title" required minLength={2} maxLength={160}/></label>
        <label className="field-label">Categoria<select className="field-input" name="category" required defaultValue="ACTIVITY"><option value="ACTIVITY">Atividade</option><option value="PLAY">Brincadeira</option><option value="EVENT">Evento</option></select></label>
        <label className="field-label">Imagem (até 5 MB)<input className="field-input" name="file" type="file" accept="image/jpeg,image/png,image/webp" required/></label>
        <p className="text-sm text-slate-500 md:col-span-2">A extensão e o tipo informado pelo navegador não substituem a validação do conteúdo. A equipe só baixa itens verificados e vinculados às turmas que pode atender.</p>
        <button className="button-primary justify-self-start" disabled={classrooms.length === 0}>Enviar para revisão privada</button>
      </form>

      <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-display text-xl font-bold">Envios recentes</h2>
        <ul className="mt-4 divide-y divide-slate-100">{media.map((asset) => {
          const scanLabel = asset.scanStatus === "CLEAN" ? "Verificado" : asset.scanStatus === "INFECTED" ? "Bloqueado" : "Em quarentena";
          const statusLabel = asset.status === "PUBLISHED" ? "Publicado" : asset.status === "REJECTED" ? "Rejeitado" : "Aguardando curadoria";
          return <li key={asset.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><strong>{asset.title}</strong><p className="text-sm text-slate-600">{asset.classroom?.name ?? "Turma removida"} · {asset.originalFilename ?? "Arquivo legado"} · {scanLabel} · {statusLabel}</p></div>{asset.scanStatus === "CLEAN" && asset.status === "PENDING" && <a className="font-semibold text-violet-700 underline" href={`/api/app/${encodeURIComponent(escola)}/midias/${encodeURIComponent(asset.id)}`}>Baixar para revisar</a>}</li>;
        })}{media.length === 0 && <li className="py-4 text-sm text-slate-600">{classrooms.length ? "Nenhum envio nesta turma ainda." : "Nenhuma turma autorizada para consultar ou enviar arquivos."}</li>}</ul>
      </section>
      <section className="mt-7 rounded-3xl border border-violet-100 bg-white p-6 shadow-sm">
        <h2 className="font-display text-xl font-bold">Envios familiares para revisão</h2>
        <p className="mt-1 text-sm text-slate-600">Só aparecem envios com autorização ativa e criança em turma do seu escopo. Aprovar é decisão editorial; não torna a imagem visível às famílias.</p>
        <form action={`/app/${encodeURIComponent(escola)}/midias`} method="get" className="mt-5 grid gap-3 rounded-2xl bg-violet-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="field-label">Estado<select name="status" className="field-input" defaultValue={review.filters.status}><option value="OPEN">Aguardando revisão</option><option value="ALL">Todos os estados</option>{Object.entries(reviewStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field-label">Turma<select name="classroomId" className="field-input" defaultValue={review.filters.classroomId}><option value="">Todas as minhas turmas</option>{classrooms.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.schoolYear}</option>)}</select></label>
          <label className="field-label">Criança<select name="studentId" className="field-input" defaultValue={review.filters.studentId}><option value="">Todas</option>{review.students.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
          <label className="field-label">Responsável<select name="authorId" className="field-input" defaultValue={review.filters.authorId}><option value="">Todos</option>{review.authors.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
          <label className="field-label">De<input type="date" name="from" className="field-input" defaultValue={review.filters.from}/></label>
          <label className="field-label">Até<input type="date" name="to" className="field-input" defaultValue={review.filters.to}/></label>
          <button className="button-primary self-end justify-self-start">Filtrar</button>
          <a className="self-center font-semibold text-violet-800 underline" href={`/app/${encodeURIComponent(escola)}/midias`}>Limpar filtros</a>
        </form>
        <p className="mt-4 text-sm text-slate-600">{review.total} envio(s) neste filtro · página {review.page} de {review.pageCount}</p>
        {review.items.some((item) => item.status === "SUBMITTED" || item.status === "UNDER_REVIEW") && <BulkMediaReview escola={escola} formId="bulk-media-review-form" items={review.items.filter((item) => item.status === "SUBMITTED" || item.status === "UNDER_REVIEW").map((item) => ({ id: item.id, title: item.mediaAsset.title, studentName: item.student.displayName }))}/>}
        <ul className="mt-2 divide-y divide-slate-100">{review.items.map((item) => { const returnQuery = new URLSearchParams({ page: String(review.page), ...review.filters }).toString(); return <li key={item.id} className="grid gap-3 py-5"><div><strong>{item.mediaAsset.title}</strong><p className="text-sm text-slate-600">{item.student.displayName} · versão {item.version} · {item.submittedBy.user.displayName} ({item.submittedBy.user.email}) · {reviewStatusLabel[item.status]}</p><p className="text-xs text-slate-500">Enviado em {item.createdAt.toLocaleString("pt-BR", { timeZone: context.timezone })}{item.reviewComment ? ` · ${item.reviewComment}` : ""}</p><a className="font-semibold text-violet-700 underline" href={`/api/app/${encodeURIComponent(escola)}/midias/${encodeURIComponent(item.mediaAsset.id)}`}>Ver para analisar</a></div>
          {(["SUBMITTED", "UNDER_REVIEW"] as string[]).includes(item.status) && <label className="flex items-center gap-2 text-sm font-semibold text-violet-900"><input form="bulk-media-review-form" type="checkbox" name="submissionId" value={item.id} className="size-4 accent-violet-700"/>Selecionar para aprovação em lote</label>}
          <details className="rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer font-semibold">Histórico de versões e decisões ({item.history.reduce((count, revision) => count + revision.events.length, 0)})</summary>{item.history.map((revision) => <section key={revision.id} className="mt-3 border-t border-slate-200 pt-3"><h3 className="text-sm font-bold">Versão {revision.version}</h3><ol className="mt-2 space-y-2">{revision.events.map((event) => <li key={event.id} className="text-sm"><strong>{event.fromStatus ? reviewStatusLabel[event.fromStatus] : "Criado"} → {reviewStatusLabel[event.toStatus]}</strong><span className="text-slate-600"> · {event.actorDisplayName} ({event.actorRole}) · {event.createdAt.toLocaleString("pt-BR", { timeZone: context.timezone })}</span>{event.comment && <p className="text-slate-700">{event.comment}</p>}</li>)}</ol></section>)}</details>
          {(["SUBMITTED", "UNDER_REVIEW"] as string[]).includes(item.status) && <><div className="flex flex-wrap gap-3">{[["UNDER_REVIEW", "Assumir revisão"], ["APPROVED", "Aprovar para uso escolar"]].map(([action, label]) => <form key={action} action={`/api/app/${encodeURIComponent(escola)}/midias/submissions/${encodeURIComponent(item.id)}`} method="post"><input type="hidden" name="action" value={action}/><input type="hidden" name="returnTo" value={`?${returnQuery}`}/><button className="button-soft">{label}</button></form>)}</div><form action={`/api/app/${encodeURIComponent(escola)}/midias/submissions/${encodeURIComponent(item.id)}`} method="post" className="flex flex-wrap items-end gap-3"><input type="hidden" name="returnTo" value={`?${returnQuery}`}/><label className="field-label min-w-64 flex-1">Orientação para a família<input className="field-input" name="comment" maxLength={1000} placeholder="Explique o que precisa ser ajustado" required/></label><button className="button-soft" name="action" value="CHANGES_REQUESTED">Solicitar ajustes</button><button className="button-soft" name="action" value="REJECTED">Não aprovar</button></form></>}
          {item.status === "APPROVED" && <form action={`/api/app/${encodeURIComponent(escola)}/midias/publications/${encodeURIComponent(item.id)}`} method="post"><button className="button-primary">Solicitar publicação no portfólio individual</button><p className="mt-1 text-xs text-slate-600">Aprovação escolar não publica; todos os responsáveis ativos ainda precisam consentir.</p></form>}</li>; })}{review.items.length === 0 && <li className="py-4 text-sm text-slate-600">Não há envios para esses filtros no seu escopo.</li>}</ul>
        {review.pageCount > 1 && <nav aria-label="Páginas da fila de revisão" className="mt-5 flex flex-wrap gap-2">{Array.from({ length: review.pageCount }, (_, index) => index + 1).map((page) => <a key={page} aria-current={review.page === page ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-semibold ${review.page === page ? "bg-violet-700 text-white" : "bg-violet-50 text-violet-800"}`} href={reviewPageHref(escola, page, review.filters)}>{page}</a>)}</nav>}
      </section>
    </div></main>
  </div>;
}
