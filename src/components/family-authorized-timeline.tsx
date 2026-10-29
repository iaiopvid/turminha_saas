"use client";

import { useState } from "react";

type TimelineItem = { entryId: string; title: string; happenedAt: string; studentName: string; evidenceId: string; shareId: string };

export function FamilyAuthorizedTimeline({ escola, initialItems, initialCursor }: { escola: string; initialItems: TimelineItem[]; initialCursor: string | null }) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true); setError(false);
    try {
      const response = await fetch(`/api/familia/${encodeURIComponent(escola)}/timeline?cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("timeline unavailable");
      const page = await response.json() as { items: TimelineItem[]; nextCursor: string | null; hasMore: boolean };
      setItems((current) => [...current, ...page.items]); setCursor(page.hasMore ? page.nextCursor : null);
    } catch { setError(true); }
    finally { setLoading(false); }
  }
  return <section className="glass-panel border-t-8 border-violet-300">
    <h2 className="section-title">Timeline pedagógica autorizada</h2>
    <p className="mt-2 text-sm text-slate-600">Registros do diário aparecem aqui apenas quando cada responsável ativo autorizou o compartilhamento da evidência. Cada acesso ao arquivo confere novamente os vínculos e as permissões.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{items.map((item, index) => <article key={`${item.entryId}:${item.evidenceId}:${index}`} className="rounded-2xl border border-violet-100 bg-white/85 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{item.studentName} · {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "long" }).format(new Date(item.happenedAt))}</p><h3 className="mt-2 font-display text-lg font-bold">{item.title}</h3><a className="mt-3 inline-block font-semibold text-violet-700 underline" href={`/api/familia/${encodeURIComponent(escola)}/evidencias/${encodeURIComponent(item.shareId)}`}>Ver lembrança autorizada</a></article>)}</div>
    {items.length === 0 && <p className="mt-4 rounded-2xl bg-white/70 p-5 text-sm text-slate-600">Ainda não há lembranças pedagógicas autorizadas para mostrar.</p>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">Não foi possível carregar mais lembranças. Tente novamente.</p>}
    {cursor && <button type="button" onClick={loadMore} disabled={loading} className="button-soft mt-5 disabled:opacity-60">{loading ? "Carregando…" : "Carregar mais lembranças"}</button>}
  </section>;
}
