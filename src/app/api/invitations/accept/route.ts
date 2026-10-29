import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { hash, compare } from "bcryptjs";
import { z } from "zod";
import { MembershipRole } from "@/generated/prisma/client";
import { createSession, SESSION_COOKIE } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { EmailDeliveryUnavailable, sendEmailVerification } from "@/server/email/verification-mail";

const schema = z.object({ token: z.string().min(32).max(128), displayName: z.string().trim().min(2).max(100), password: z.string().min(12).max(128) });
class InvalidInvite extends Error {}
class RoleConflict extends Error {}

function invitePage(request: NextRequest, token: string, query = "") {
  return NextResponse.redirect(new URL(`/convite/${encodeURIComponent(token)}${query ? `?${query}` : ""}`, request.url), 303);
}

async function queueVerification(input: { tokenHash: string; token: string; userId?: string; email: string; displayName: string; passwordHash?: string }) {
  const queued = await prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({ where: { tokenHash: input.tokenHash }, select: { id: true, tenantId: true, email: true, displayName: true, expiresAt: true, acceptedAt: true, revokedAt: true, tenant: { select: { status: true, school: { select: { name: true } } } } } });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date() || invitation.tenant.status !== "ACTIVE" || !invitation.tenant.school || invitation.email.toLowerCase() !== input.email.toLowerCase()) throw new InvalidInvite();
    const user = input.userId
      ? await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { id: true, email: true } })
      : await tx.user.create({ data: { email: invitation.email, displayName: input.displayName, passwordHash: input.passwordHash! }, select: { id: true, email: true } });
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) throw new InvalidInvite();
    if (input.userId) await tx.user.update({ where: { id: user.id }, data: { displayName: input.displayName } });
    const tokenHash = createHash("sha256").update(input.token).digest("hex");
    await tx.emailVerification.create({ data: { tenantId: invitation.tenantId, userId: user.id, invitationId: invitation.id, tokenHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    return { userId: user.id, email: invitation.email, displayName: input.displayName, schoolName: invitation.tenant.school.name };
  });
  // Keep the challenge as a pending-account marker if delivery fails. A provider
  // can accept a message and then time out; retaining it allows safe resend
  // without treating the account as a trusted legacy account.
  await sendEmailVerification({ to: queued.email, displayName: queued.displayName, schoolName: queued.schoolName, token: input.token });
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const form = await request.formData();
  const parsed = schema.safeParse({ token: form.get("token"), displayName: form.get("displayName"), password: form.get("password") });
  if (!parsed.success) return new NextResponse("Dados do convite inválidos.", { status: 400 });
  const { token, displayName, password } = parsed.data;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash }, select: { id: true, tenantId: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true } });
  if (invitation) {
    const limit = await consumeRateLimit("invite-accept", tokenHash, { limit: 8, windowMs: 15 * 60 * 1000 });
    if (!limit.allowed) return invitePage(request, token, "error=rate-limit");
  }
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) return invitePage(request, token);
  const existing = await prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true, email: true, passwordHash: true, emailVerifiedAt: true } });
  if (existing && !await compare(password, existing.passwordHash)) return invitePage(request, token, "error=1");

  const pendingVerification = existing ? await prisma.emailVerification.findFirst({ where: { userId: existing.id }, select: { id: true } }) : null;
  if (!existing || pendingVerification) {
    const deliveryLimit = await consumeRateLimit("email-verification-send", invitation.email.toLowerCase(), { limit: 3, windowMs: 30 * 60 * 1000 });
    if (!deliveryLimit.allowed) return invitePage(request, token, "email=rate-limit");
    try {
      const verificationToken = randomBytes(32).toString("base64url");
      await queueVerification({ tokenHash, token: verificationToken, userId: existing?.id, email: invitation.email, displayName, passwordHash: existing ? undefined : await hash(password, 12) });
      return invitePage(request, token, "email=sent");
    } catch (error) {
      if (error instanceof InvalidInvite) return invitePage(request, token);
      if (error instanceof EmailDeliveryUnavailable) return invitePage(request, token, "email=unavailable");
      return invitePage(request, token, "error=1");
    }
  }

  try {
    const accepted = await prisma.$transaction(async (tx) => {
      const fresh = await tx.invitation.findUnique({ where: { tokenHash }, select: { id: true, tenantId: true, email: true, role: true, studentId: true, classroomId: true, expiresAt: true, acceptedAt: true, revokedAt: true, tenant: { select: { slug: true, status: true } } } });
      if (!fresh || fresh.acceptedAt || fresh.revokedAt || fresh.expiresAt <= new Date() || fresh.tenant.status !== "ACTIVE" || fresh.email.toLowerCase() !== existing.email.toLowerCase()) throw new InvalidInvite();
      const claim = await tx.invitation.updateMany({ where: { id: fresh.id, tenantId: fresh.tenantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
      if (claim.count !== 1) throw new InvalidInvite();
      const user = await tx.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: existing.emailVerifiedAt ?? new Date() }, select: { id: true } });
      const currentMembership = await tx.membership.findUnique({ where: { tenantId_userId: { tenantId: fresh.tenantId, userId: user.id } }, select: { role: true, status: true } });
      if (currentMembership?.status === "ACTIVE" && currentMembership.role !== fresh.role) throw new RoleConflict();
      const membership = await tx.membership.upsert({ where: { tenantId_userId: { tenantId: fresh.tenantId, userId: user.id } }, create: { tenantId: fresh.tenantId, userId: user.id, role: fresh.role, status: "ACTIVE" }, update: { role: fresh.role, status: "ACTIVE" }, select: { id: true } });
      if (fresh.role === MembershipRole.GUARDIAN) {
        if (!fresh.studentId) throw new InvalidInvite();
        await tx.studentGuardian.upsert({ where: { tenantId_studentId_membershipId: { tenantId: fresh.tenantId, studentId: fresh.studentId, membershipId: membership.id } }, create: { tenantId: fresh.tenantId, studentId: fresh.studentId, membershipId: membership.id, approved: true }, update: { approved: true, revokedAt: null } });
      } else {
        if (!fresh.classroomId) throw new InvalidInvite();
        await tx.classroomStaff.upsert({ where: { tenantId_classroomId_membershipId: { tenantId: fresh.tenantId, classroomId: fresh.classroomId, membershipId: membership.id } }, create: { tenantId: fresh.tenantId, classroomId: fresh.classroomId, membershipId: membership.id }, update: {} });
      }
      return { userId: user.id, schoolSlug: fresh.tenant.slug, role: fresh.role };
    });
    const session = await createSession(accepted.userId);
    const destination = accepted.role === MembershipRole.GUARDIAN ? `/familia/${accepted.schoolSlug}` : `/app/${accepted.schoolSlug}/dashboard`;
    const response = NextResponse.redirect(new URL(destination, request.url), 303);
    response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: session.expiresAt });
    return response;
  } catch (error) {
    if (error instanceof InvalidInvite || error instanceof RoleConflict) return invitePage(request, token, "error=1");
    return invitePage(request, token, "error=1");
  }
}
