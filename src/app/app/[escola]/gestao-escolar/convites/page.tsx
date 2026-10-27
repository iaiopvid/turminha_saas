import { redirect } from "next/navigation";
import Link from "next/link";
import { MembershipRole } from "@/generated/prisma/client";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";
import { AdminSidebar } from "@/components/admin-sidebar";
import { InviteCreator } from "@/components/invite-creator";
import { RevokeInviteButton } from "@/components/revoke-invite-button";

export const dynamic = "force-dynamic";

export default async function InvitationsPage({ params }: { params: Promise<{ escola: string }> }) {
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR]); }
  catch (error) { if (error instanceof ContextError && error.status === 401) redirect(`/entrar?tenant=${encodeURIComponent(escola)}`); return <main className="access-denied">Convites restritos à gestão da escola.</main>; }
  const [students, classrooms, invitations] = await Promise.all([
    prisma.student.findMany({ where: { tenantId: context.tenantId }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" }, take: 100 }),
    prisma.classroom.findMany({ where: { tenantId: context.tenantId, status: "ACTIVE" }, select: { id: true, name: true, schoolYear: true }, orderBy: [{ schoolYear: "desc" }, { name: "asc" }], take: 100 }),
    prisma.invitation.findMany({ where: { tenantId: context.tenantId }, select: { id: true, email: true, displayName: true, role: true, acceptedAt: true, revokedAt: true, expiresAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const now = new Date();
  return <div className="admin-shell"><AdminSidebar slug={escola} active="gestao-escolar" schoolName={context.schoolName} displayName={context.displayName}/><main className="admin-main"><div className="admin-content max-w-5xl">
    <Link className="font-semibold text-violet-700" href={`/app/${escola}/gestao-escolar`}>← Gestão escolar</Link><p className="eyebrow mt-8">ACESSO À ESCOLA</p><h1 className="font-display text-3xl font-bold">Convites</h1><p className="mt-2 text-slate-600">Convide responsáveis e equipe para um vínculo específico. Compartilhe o link por um canal apropriado.</p>
    <InviteCreator school={escola} students={students.map((student) => ({ id: student.id, label: student.displayName }))} classrooms={classrooms.map((classroom) => ({ id: classroom.id, label: `${classroom.name} · ${classroom.schoolYear}` }))}/>
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-display text-xl font-bold">Convites recentes</h2><ul className="mt-4 divide-y divide-slate-100">{invitations.map((invite) => { const state = invite.acceptedAt ? "Aceito" : invite.revokedAt ? "Revogado" : invite.expiresAt <= now ? "Expirado" : "Aguardando"; return <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><strong>{invite.displayName}</strong><p className="text-sm text-slate-600">{invite.email} · {invite.role} · {state}</p><time className="text-xs text-slate-500" dateTime={invite.expiresAt.toISOString()}>Expira {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: context.timezone }).format(invite.expiresAt)}</time></div>{state === "Aguardando" && <RevokeInviteButton school={escola} invitationId={invite.id}/>}</li>; })}{invitations.length === 0 && <li className="py-4 text-sm text-slate-600">Ainda não há convites.</li>}</ul></section>
    <p className="mt-4 text-sm text-slate-500">Nenhum e-mail é enviado nesta etapa. O link completo só aparece na resposta da criação e o banco guarda apenas o hash do token.</p>
  </div></main></div>;
}
