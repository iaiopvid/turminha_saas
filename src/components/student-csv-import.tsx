"use client";

import { useState } from "react";

type Row = { line: number; recordType: "student" | "guardian" | "staff"; sourceId: string; name: string; email: string; studentSourceId: string; schoolYear: string; classroomName: string; role: string };
type Issue = { line: number; code: string; message: string };
type Result = { rows?: Row[]; rowIssues?: { line: number; issues: Issue[] }[]; valid?: boolean; errorCount?: number; error?: string; batchId?: string; importedStudents?: number; createdInvitations?: number; invitationUrls?: { name: string; email: string; role: string; url: string }[]; alreadyImported?: boolean };
const labels: Record<keyof Row, string> = { line: "Linha", recordType: "Tipo", sourceId: "ID de origem", name: "Nome", email: "E-mail", studentSourceId: "ID do aluno", schoolYear: "Ano", classroomName: "Turma", role: "Papel" };

export function StudentCsvImport({ endpoint }: { endpoint: string }) {
  const [rows, setRows] = useState<Row[]>([]); const [issues, setIssues] = useState<Result["rowIssues"]>([]); const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false); const [links, setLinks] = useState<NonNullable<Result["invitationUrls"]>>([]);
  async function send(payload: unknown) {
    setBusy(true); setStatus(""); setLinks([]);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
      const data = await response.json() as Result;
      if (data.rows) setRows(data.rows);
      if (data.rowIssues) setIssues(data.rowIssues);
      if (data.invitationUrls) setLinks(data.invitationUrls);
      setStatus(data.error ?? (response.ok ? (data.alreadyImported ? "Este lote já foi importado; nenhum registro foi duplicado." : data.batchId ? `Lote ${data.batchId} concluído. ${data.importedStudents} estudantes e ${data.createdInvitations} convites.` : data.valid ? "Prévia válida. Revise os dados e confirme a importação." : `Prévia carregada: ${data.errorCount} problema(s).`) : "Não foi possível processar a solicitação."));
    } catch { setStatus("Falha de rede. O lote não foi confirmado; consulte a situação antes de reenviar."); }
    finally { setBusy(false); }
  }
  async function upload(file?: File) { if (!file) return; if (file.size > 1_000_000) { setStatus("O arquivo excede 1 MB."); return; } await send({ action: "preview", csv: await file.text() }); }
  function update(index: number, key: keyof Row, value: string) { setRows((current) => current.map((row, i) => i === index ? { ...row, [key]: key === "line" ? Number(value) : value } as Row : row)); }
  const invalidByLine = new Map((issues ?? []).map((entry) => [entry.line, entry.issues]));
  return <section className="mt-6 space-y-5">
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-display text-xl font-bold">1. Envie e confira a prévia</h2><p className="mt-1 text-sm text-slate-600">Até 500 linhas e 1 MB. O arquivo é processado em memória e não é guardado. IDs de origem permitem repetir uma importação com segurança.</p><label className="field-label mt-4">Arquivo CSV<input className="field-input" type="file" accept=".csv,text/csv" onChange={(event) => void upload(event.target.files?.[0])}/></label><a className="mt-3 inline-block font-semibold text-violet-700 underline" href="/templates/turminha-import.csv" download>Baixar modelo CSV</a></div>
    {rows.length > 0 && <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-display text-xl font-bold">2. Dry-run e correções</h2><p className="mt-1 text-sm text-slate-600">Campos podem ser corrigidos antes de revalidar. A confirmação só prossegue quando todas as linhas forem válidas.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-left text-sm"><thead><tr>{(["line", "recordType", "sourceId", "name", "email", "studentSourceId", "schoolYear", "classroomName", "role"] as const).map((key) => <th className="border-b p-2" key={key}>{labels[key]}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={`${row.line}-${i}`} className={invalidByLine.get(row.line)?.length ? "bg-rose-50" : ""}>{(["line", "recordType", "sourceId", "name", "email", "studentSourceId", "schoolYear", "classroomName", "role"] as const).map((key) => <td className="border-b p-1" key={key}>{key === "line" ? row.line : <input aria-label={`${labels[key]} linha ${row.line}`} className="w-full rounded border border-slate-200 p-2" value={row[key]} onChange={(event) => update(i, key, event.target.value)} />}</td>)}</tr>)}</tbody></table></div>
      <ul className="mt-3 space-y-1 text-sm text-rose-800">{(issues ?? []).flatMap((entry) => entry.issues.map((issue) => <li key={`${issue.line}-${issue.code}`}>Linha {issue.line}: {issue.message}</li>))}</ul>
      <div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} className="button-secondary" onClick={() => void send({ action: "dry-run", rows })}>Revalidar dry-run</button><button disabled={busy || !issues || issues.length > 0} className="button-primary" onClick={() => void send({ action: "commit", rows })}>Confirmar importação</button></div>
    </div>}
    {status && <p role="status" className="rounded-xl bg-violet-50 p-4 text-violet-950">{busy ? "Processando…" : status}</p>}
    {links.length > 0 && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4"><h2 className="font-bold">Convites para copiar agora</h2><p className="text-sm">Os links só aparecem nesta resposta. Compartilhe cada um com a pessoa correspondente; nenhum e-mail foi enviado.</p><ul className="mt-2 space-y-2">{links.map((invite, i) => <li key={`${invite.url}-${i}`}><strong>{invite.name}</strong> · {invite.email} ({invite.role}): <a className="break-all font-semibold text-violet-800 underline" href={invite.url}>{invite.url}</a></li>)}</ul></div>}
  </section>;
}
