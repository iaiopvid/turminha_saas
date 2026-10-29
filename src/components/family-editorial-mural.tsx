"use client";

import { useEffect, useRef, useState } from "react";

export type EditorialMuralItem = { publicationId: string; assetId: string; title: string; studentName: string; publishedAt: string };

export function FamilyEditorialMural({ escola, studentFilter, studentOptions, initialItems, initialCursor, initialInvalidFilter = false }: {
  escola: string;
  studentFilter: string | null;
  studentOptions: { id: string; displayName: string }[];
  initialItems: EditorialMuralItem[];
  initialCursor: string | null;
  initialInvalidFilter?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [invalidFilter, setInvalidFilter] = useState(initialInvalidFilter);
  const loadingRef = useRef(false);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const feedKey = `${escola}:${studentFilter ?? "all"}`;

  useEffect(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    loadingRef.current = false;
    setItems(initialItems);
    setCursor(initialCursor);
    setLoading(false);
    setError(false);
    setInvalidFilter(initialInvalidFilter);
    return () => controllerRef.current?.abort();
  }, [feedKey, initialItems, initialCursor, initialInvalidFilter]);

  async function loadMore() {
    if (!cursor || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    const generation = generationRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const params = new URLSearchParams({ cursor });
      if (studentFilter) params.set("studentId", studentFilter);
      const response = await fetch(`/api/familia/${encodeURIComponent(escola)}/mural-editorial?${params}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("mural unavailable");
      const page = await response.json() as { items: EditorialMuralItem[]; nextCursor: string | null; hasMore: boolean; invalidFilter?: boolean };
      if (generation !== generationRef.current) return;
      setItems((current) => {
        const known = new Set(current.map((item) => item.publicationId));
        return [...current, ...page.items.filter((item) => !known.has(item.publicationId))];
      });
      setCursor(page.hasMore ? page.nextCursor : null);
      setInvalidFilter(Boolean(page.invalidFilter));
    } catch {
      if (generation === generationRef.current && !controller.signal.aborted) setError(true);
    } finally {
      if (generation === generationRef.current) {
        loadingRef.current = false;
        setLoading(false);
        controllerRef.current = null;
      }
    }
  }

  return <section className="glass-panel border-t-8 border-amber-300">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="section-title">Mural de lembranças</h2><p className="mt-2 text-sm text-slate-600">Momentos do portfólio individual compartilhados com os responsáveis autorizados. Cada página e cada arquivo conferem novamente os vínculos e consentimentos.</p></div><form action={`/familia/${encodeURIComponent(escola)}`} method="get" className="flex items-end gap-2"><label className="field-label">Criança<select name="muralStudentId" className="field-input" defaultValue={studentFilter ?? ""}><option value="">Todas as crianças</option>{studentOptions.map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}</select></label><button className="button-soft">Filtrar</button></form></div>
    {invalidFilter && <p role="alert" className="mt-4 text-sm text-rose-700">Esse filtro não corresponde a uma criança vinculada à sua família.</p>}
    <div className="mt-5 grid gap-4 sm:grid-cols-2">{items.map((item) => <article key={item.publicationId} className="rounded-3xl border-2 border-amber-100 bg-white/85 p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{item.studentName} · {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "long" }).format(new Date(item.publishedAt))}</p><h3 className="mt-2 font-display text-lg font-bold">{item.title}</h3><a className="mt-3 inline-flex font-semibold text-violet-700 underline" href={`/api/app/${encodeURIComponent(escola)}/midias/${encodeURIComponent(item.assetId)}`}>Ver lembrança</a></article>)}</div>
    {items.length === 0 && !invalidFilter && <p className="mt-4 rounded-2xl bg-white/70 p-5 text-sm text-slate-600">Ainda não há lembranças editoriais autorizadas para mostrar.</p>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">Não foi possível carregar a próxima página. Suas lembranças atuais foram preservadas; tente novamente.</p>}
    {cursor && <button type="button" onClick={loadMore} disabled={loading} className="button-soft mt-5 disabled:opacity-60">{loading ? "Carregando…" : "Carregar mais lembranças"}</button>}
  </section>;
}
