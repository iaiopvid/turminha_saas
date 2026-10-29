import { AccessibleConfirmAction } from "@/components/accessible-confirm-action";

export function FamilyMediaAction({ escola, assetId, purpose, label, confirmation }: { escola: string; assetId: string; purpose: "PRIVATE_STORAGE" | "SCHOOL_REVIEW"; label: string; confirmation: string }) {
  return <AccessibleConfirmAction action={`/api/familia/${encodeURIComponent(escola)}/recordacoes/${encodeURIComponent(assetId)}`} label={label} title="Confirmar ação" message={confirmation} fields={[{ name: "purpose", value: purpose }]}/>;
}
