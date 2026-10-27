import type { Metadata } from "next";
import { createHash } from "node:crypto";
import Link from "next/link";
import { MembershipRole } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

function obscureEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}•••@${domain}`;
}

export default async function InvitationAcceptPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  if (token.length > 128) return <main className="min-h-screen bg-[#e0f7fa] px-4 py-12"><section className="mx-auto max-w-md rounded-3xl bg-white p-8"><h1 className="font-display text-2xl font-bold">Convite indisponível</h1><p className="mt-3 text-slate-600">Solicite um novo link à escola.</p></section></main>;
  const invite = await prisma.invitation.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") }, select: { email: true, displayName: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, student: { select: { displayName: true } }, classroom: { select: { name: true } }, tenant: { select: { slug: true, status: true, school: { select: { name: true } } } } } });
  const active = invite && !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date() && invite.tenant.status === "ACTIVE";
  const roleLabel = invite?.role === MembershipRole.GUARDIAN ? "responsável" : invite?.role === MembershipRole.TEACHER ? "professora" : "assistente";
  return <main className="min-h-screen bg-[#e0f7fa] px-4 py-12"><section className="mx-auto max-w-md rounded-[2rem] border-4 border-white bg-white/95 p-7 shadow-xl sm:p-9">
    <p className="font-display text-sm font-bold uppercase tracking-widest text-pink-500">Turminha</p><h1 className="mt-2 font-display text-3xl font-bold">Aceitar convite</h1>
    {query.error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">O convite ou a senha não puderam ser validados. Confira os dados e tente novamente ou peça um novo link à escola.</p>}
    {!active || !invite?.tenant.school ? <><p className="mt-4 text-slate-600">Este convite expirou, foi revogado ou já foi utilizado. Solicite um novo link à escola.</p><Link className="button-secondary mt-5" href="/">Ir para Turminha</Link></> : <>
      <p className="mt-3 text-slate-600">Você foi convidado como <strong>{roleLabel}</strong> para {invite.tenant.school.name}{invite.student ? `, com vínculo a ${invite.student.displayName}` : invite.classroom ? `, na turma ${invite.classroom.name}` : ""}.</p>
      <p className="mt-2 text-sm text-slate-600">E-mail do convite: <strong>{obscureEmail(invite.email)}</strong></p>
      <form action="/api/invitations/accept" method="post" className="mt-6 space-y-4"><input type="hidden" name="token" value={token}/><label className="field-label">Nome<input className="field-input" name="displayName" defaultValue={invite.displayName} required minLength={2} maxLength={100} autoComplete="name"/></label><label className="field-label">Senha da sua conta<input className="field-input" name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label><p className="text-xs leading-5 text-slate-500">Se você já tem uma conta Turminha, use a senha atual. Caso contrário, esta senha criará sua conta com o e-mail convidado.</p><button className="button-primary w-full">Aceitar e acessar</button></form>
    </>}
  </section></main>;
}
