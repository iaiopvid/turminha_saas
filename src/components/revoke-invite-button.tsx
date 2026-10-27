"use client";

import { useState } from "react";

export function RevokeInviteButton({ school, invitationId }: { school: string; invitationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function revoke() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/app/${encodeURIComponent(school)}/convites/${encodeURIComponent(invitationId)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Não foi possível revogar o convite.");
      setMessage("Revogado. Atualize a página para ver o estado.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao revogar."); }
    finally { setBusy(false); }
  }
  return <div className="flex items-center gap-2"><button type="button" className="button-secondary" disabled={busy} onClick={() => void revoke()}>{busy ? "Revogando…" : "Revogar"}</button>{message && <span className="text-xs text-slate-600" role="status">{message}</span>}</div>;
}
