"use client";

import { useId, useRef } from "react";

export function AccessibleConfirmAction({ action, label, title, message, fields = [], className = "font-semibold text-rose-700 underline" }: {
  action: string;
  label: string;
  title: string;
  message: string;
  fields?: { name: string; value: string }[];
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `confirm-title-${useId()}`;
  const messageId = `${titleId}-description`;
  return <>
    <button type="button" className={className} onClick={() => dialogRef.current?.showModal()}>{label}</button>
    <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={messageId} onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}>
      <div className="confirm-dialog-card"><h2 id={titleId} className="font-display text-xl font-bold">{title}</h2><p id={messageId} className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" className="button-secondary" onClick={() => dialogRef.current?.close()}>Cancelar</button><form action={action} method="post">{fields.map((field) => <input key={field.name} type="hidden" name={field.name} value={field.value}/>)}<button className="button-primary">Confirmar</button></form></div>
      </div>
    </dialog>
  </>;
}
