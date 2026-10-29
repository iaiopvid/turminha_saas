export function FamilyResubmitForm({ escola, studentId, submissionId, title, category, studentName }: { escola: string; studentId: string; submissionId: string; title: string; category: "ACTIVITY" | "PLAY" | "EVENT"; studentName: string }) {
  return <details className="mt-3 w-full rounded-xl bg-amber-50 p-3">
    <summary className="cursor-pointer font-semibold text-amber-900">Enviar uma nova versão para revisão</summary>
    <form action={`/api/familia/${encodeURIComponent(escola)}/recordacoes`} method="post" encType="multipart/form-data" className="mt-3 grid gap-3">
      <input type="hidden" name="studentId" value={studentId}/><input type="hidden" name="priorSubmissionId" value={submissionId}/><input type="hidden" name="submitToSchool" value="true"/>
      <label className="field-label">Título<input className="field-input" name="title" required minLength={2} maxLength={160} defaultValue={title}/></label>
      <label className="field-label">Nova imagem para {studentName}<input className="field-input" name="file" type="file" accept="image/jpeg,image/png,image/webp" required/></label>
      <input type="hidden" name="category" value={category}/>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="privateConsent" value="yes" required/><span>Confirmo a guarda desta nova versão nas minhas recordações privadas.</span></label>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="schoolConsent" value="yes" required/><span>Autorizo novamente a equipe pertinente a revisar esta nova versão. Isso não autoriza publicação.</span></label>
      <button className="button-soft justify-self-start">Enviar nova versão</button>
    </form>
  </details>;
}
