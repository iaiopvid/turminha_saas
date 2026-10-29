import type { Metadata } from "next";
import { createHash } from "node:crypto";
import Link from "next/link";
import { MembershipRole } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

function obscureEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

export default async function VerifyEmailPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params; const query = await searchParams;
  if (token.length < 32 || token.length > 128) return <main className="min-h-screen bg-[#e0f7fa] px-4 py-12"><section className="mx-auto max-w-md rounded-3xl bg-white p-8"><h1 className="font-display text-2xl font-bold">Confirmação indisponível</h1><p className="mt-3 text-slate-600">Peça à escola um novo convite.</p></section></main>;
  const verification = await prisma.emailVerification.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") }, select: { expiresAt: true, user: { select: { email: true } }, invitation: { select: { email: true, role: true, acceptedAt: true, revokedAt: true, expiresAt: true, tenant: { select: { status: true, school: { select: { name: true } } } } } } } });
  const active = verification && verification.expiresAt > new Date() && verification.invitation.email.toLowerCase() === verification.user.email.toLowerCase() && !verification.invitation.acceptedAt && !verification.invitation.revokedAt && verification.invitation.expiresAt > new Date() && verification.invitation.tenant.status === "ACTIVE";
  const role = verification?.invitation.role === MembershipRole.GUARDIAN ? "responsável" : verification?.invitation.role === MembershipRole.TEACHER ? "professora" : "assistente";
  return <main className="min-h-screen bg-[#e0f7fa] px-4 py-12"><section className="mx-auto max-w-md rounded-[2rem] border-4 border-white bg-white/95 p-7 shadow-xl sm:p-9">
    <p className="font-display text-sm font-bold uppercase tracking-widest text-pink-500">Turminha</p><h1 className="mt-2 font-display text-3xl font-bold">Confirme seu e-mail</h1>
    {query.error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">Não foi possível confirmar. O link pode ter expirado ou o convite foi cancelado.</p>}
    {!active || !verification?.invitation.tenant.school ? <><p className="mt-4 text-slate-600">Este link expirou, já foi usado ou o convite foi cancelado. Peça à escola para enviar outro convite.</p><Link href="/" className="button-secondary mt-5 inline-flex">Ir para Turminha</Link></> : <>
      <p className="mt-3 text-slate-600">Confirme <strong>{obscureEmail(verification.user.email)}</strong> para aceitar o convite como {role} de <strong>{verification.invitation.tenant.school.name}</strong>.</p>
      <p className="mt-2 text-sm text-slate-600">O convite será ativado somente depois desta confirmação. O link expira em 24 horas.</p>
      <form action="/api/invitations/verify" method="post" className="mt-6"><input type="hidden" name="token" value={token}/><button className="button-primary w-full">Confirmar e acessar</button></form>
    </>}
  </section></main>;
}
