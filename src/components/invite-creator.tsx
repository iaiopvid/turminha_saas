"use client";

import { useState } from "react";

type Choice = { id: string; label: string };

export function InviteCreator({ school, students, classrooms }: { school: string; students: Choice[]; classrooms: Choice[] }) {
  const [role, setRole] = useState<"GUARDIAN" | "TEACHER" | "ASSISTANT">("GUARDIAN");
  const [inviteUrl, setInviteUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const needsStudent = role === "GUARDIAN";
  async function submit(formData: FormData) {
    setBusy(true); setInviteUrl(""); setMessage("");
    try {
      const response = await fetch(`/api/app/${encodeURIComponent(school)}/convites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, email: formData.get("email"), displayName: formData.get("displayName"), studentId: formData.get("studentId") || null, classroomId: formData.get("classroomId") || null }),
      });
      const result = await response.json() as { invitationUrl?: string; error?: string };
      if (!response.ok || !result.invitationUrl) throw new Error(result.error ?? "Não foi possível criar o convite.");
      setInviteUrl(new URL(result.invitationUrl, window.location.origin).toString());
      setMessage("Link criado. Copie e compartilhe diretamente com a pessoa convidada; ele expira em sete dias. Contas novas precisam confirmar o e-mail. O envio depende da configuração de e-mail da plataforma.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar o convite.");
    } finally { setBusy(false); }
  }
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 className="font-display text-xl font-bold">Novo convite</h2>
    <p className="mt-1 text-sm text-slate-600">O convite é de uso único e vincula a pessoa ao e-mail informado.</p>
    <form action={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="field-label">Perfil<select className="field-input" value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="GUARDIAN">Responsável</option><option value="TEACHER">Professora</option><option value="ASSISTANT">Assistente</option></select></label>
      <label className="field-label">Nome<input className="field-input" name="displayName" required minLength={2} maxLength={100}/></label>
      <label className="field-label">E-mail convidado<input className="field-input" name="email" type="email" required maxLength={254} autoComplete="off"/></label>
      {needsStudent ? <label className="field-label">Criança vinculada<select className="field-input" name="studentId" required defaultValue=""><option value="" disabled>Selecione a criança</option>{students.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label> : <label className="field-label">Turma<select className="field-input" name="classroomId" required defaultValue=""><option value="" disabled>Selecione a turma</option>{classrooms.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      <div className="sm:col-span-2"><button className="button-primary" disabled={busy}>{busy ? "Criando…" : "Criar link de convite"}</button></div>
    </form>
    {message && <p className="mt-4 rounded-xl bg-violet-50 p-3 text-sm text-violet-950" role="status">{message}</p>}
    {inviteUrl && <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-4"><label className="field-label">Link para compartilhar<input className="field-input" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()}/></label><button type="button" className="button-secondary mt-3" onClick={() => void navigator.clipboard?.writeText(inviteUrl)}>Copiar link</button></div>}
  </section>;
}
