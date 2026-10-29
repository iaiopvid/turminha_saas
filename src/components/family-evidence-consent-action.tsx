import { AccessibleConfirmAction } from "@/components/accessible-confirm-action";

export function FamilyEvidenceConsentAction({ escola, shareId, action }: { escola: string; shareId: string; action: "grant" | "revoke" }) {
  const endpoint = `/api/familia/${encodeURIComponent(escola)}/evidencias/${encodeURIComponent(shareId)}/consentimento`;
  if (action === "revoke") return <AccessibleConfirmAction action={endpoint} label="Retirar autorização" title="Retirar autorização?" message="Retirar esta autorização bloqueará imediatamente novos acessos a esta evidência. Deseja continuar?" fields={[{ name: "action", value: action }]}/>;
  return <form action={endpoint} method="post" className="grid gap-2">
    <input type="hidden" name="action" value={action}/>
    <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="termsAccepted" value="yes" required/><span>Autorizo esta conta familiar a acessar esta evidência específica. Ela não será mostrada a outros responsáveis nem publicada.</span></label>
    <button className="button-primary justify-self-start">Autorizar acesso a esta evidência</button>
  </form>;
}
