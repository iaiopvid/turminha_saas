"use client";

import { useState, type FormEvent } from "react";

type ReviewChoice = { id: string; title: string; studentName: string };
type ReviewResult = { id: string; ok: boolean; reason?: string };

export function BulkMediaReview({ escola, formId, items }: { escola: string; formId: string; items: ReviewChoice[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<ReviewResult[] | null>(null);
  const titleById = new Map(items.map((item) => [item.id, `${item.studentName} · ${item.title}`]));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const response = await fetch(`/api/app/${encodeURIComponent(escola)}/midias/submissions/bulk`, {
        method: "POST",
        body: new FormData(event.currentTarget),
        cache: "no-store",
      });
      const payload = await response.json() as { error?: string; results?: ReviewResult[] };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível processar as decisões.");
      setResults(payload.results ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível processar as decisões.");
    } finally {
      setBusy(false);
    }
  }

  const successes = results?.filter((result) => result.ok).length ?? 0;
  const failures = results ? results.length - successes : 0;
  return <form id={formId} onSubmit={submit} className="mt-5 rounded-2xl border border-violet-100 bg-violet-50 p-4">
    <input type="hidden" name="action" value="APPROVED"/>
    <div className="flex flex-wrap items-center gap-3"><button className="button-primary" type="submit" disabled={busy || items.length === 0}>{busy ? "Processando envios…" : "Aprovar selecionados para uso escolar"}</button><p className="text-sm text-slate-600">Cada envio é revalidado separadamente. Aprovar não publica no portfólio da família.</p></div>
    {error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-800">{error}</p>}
    {results && <div role={failures ? "alert" : "status"} aria-live="polite" className="mt-4 rounded-xl bg-white p-4 text-sm">
      <p className="font-bold">{successes} aprovado(s) · {failures} falha(s)</p>
      <ul className="mt-2 space-y-1">{results.map((result, index) => <li key={`${result.id}-${index}`} className={result.ok ? "text-emerald-800" : "text-rose-800"}><strong>{titleById.get(result.id) ?? "Envio não disponível"}:</strong> {result.ok ? "Aprovado para uso escolar. Não publicado para famílias." : result.reason}</li>)}</ul>
      {successes > 0 && <a className="mt-3 inline-flex font-semibold text-violet-700 underline" href={`/app/${encodeURIComponent(escola)}/midias`}>Atualizar a fila</a>}
    </div>}
  </form>;
}
