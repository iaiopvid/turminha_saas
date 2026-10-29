import { AccessibleConfirmAction } from "@/components/accessible-confirm-action";

export function JournalEvidenceShareRequest({ escola, entryId, evidenceId, studentName, enrollmentId, requested }: { escola: string; entryId: string; evidenceId: string; studentName: string; enrollmentId: string; requested: boolean }) {
  const action = `/api/app/${encodeURIComponent(escola)}/diario/${encodeURIComponent(entryId)}/evidencias/${encodeURIComponent(evidenceId)}/compartilhamento`;
  if (requested) return <div className="flex flex-wrap items-center gap-2">
    <span className="text-xs font-semibold text-sky-800">Autorização solicitada · {studentName}</span>
    <AccessibleConfirmAction action={action} label="Encerrar" title="Encerrar solicitação?" message="Encerrar esta solicitação bloqueará novos acessos familiares. Deseja continuar?" fields={[{ name: "enrollmentId", value: enrollmentId }, { name: "action", value: "close" }]} className="text-xs font-semibold text-rose-700 underline"/>
  </div>;
  return <form action={action} method="post" className="flex items-center gap-2">
    <input type="hidden" name="enrollmentId" value={enrollmentId}/>
    <input type="hidden" name="action" value="request"/>
    <button className="font-semibold text-sky-800 underline">Solicitar autorização de {studentName}</button>
  </form>;
}
