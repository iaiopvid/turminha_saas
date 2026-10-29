import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { MembershipRole } from "@/generated/prisma/client";
import { createSession, SESSION_COOKIE } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { consumeRateLimit } from "@/server/security/rate-limit";

const schema = z.object({ token: z.string().min(32).max(128) });
class InvalidVerification extends Error {}

function verificationPage(request: NextRequest, token: string, error = false) {
  return NextResponse.redirect(new URL(`/verificar-email/${encodeURIComponent(token)}${error ? "?error=1" : ""}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const form = await request.formData(); const parsed = schema.safeParse({ token: form.get("token") });
  if (!parsed.success) return new NextResponse("Link de confirmação inválido.", { status: 400 });
  const { token } = parsed.data; const tokenHash = createHash("sha256").update(token).digest("hex");
  const verification = await prisma.emailVerification.findUnique({ where: { tokenHash }, select: { userId: true, expiresAt: true } });
  if (!verification) return verificationPage(request, token, true);
  const limit = await consumeRateLimit("email-verification-complete", tokenHash, { limit: 10, windowMs: 30 * 60 * 1000 });
  if (!limit.allowed) return verificationPage(request, token, true);
  if (verification.expiresAt <= new Date()) return verificationPage(request, token, true);

  try {
    const accepted = await prisma.$transaction(async (tx) => {
      const fresh = await tx.emailVerification.findUnique({ where: { tokenHash }, select: { id: true, tenantId: true, userId: true, expiresAt: true, user: { select: { id: true, email: true, emailVerifiedAt: true } }, invitation: { select: { id: true, tenantId: true, email: true, role: true, studentId: true, classroomId: true, expiresAt: true, acceptedAt: true, revokedAt: true, tenant: { select: { slug: true, status: true } } } } } });
      const now = new Date();
      if (!fresh || fresh.expiresAt <= now || fresh.userId !== fresh.user.id || fresh.tenantId !== fresh.invitation.tenantId || fresh.user.email.toLowerCase() !== fresh.invitation.email.toLowerCase() || fresh.invitation.acceptedAt || fresh.invitation.revokedAt || fresh.invitation.expiresAt <= now || fresh.invitation.tenant.status !== "ACTIVE") throw new InvalidVerification();
      const claim = await tx.invitation.updateMany({ where: { id: fresh.invitation.id, tenantId: fresh.tenantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { acceptedAt: now } });
      if (claim.count !== 1) throw new InvalidVerification();
      await tx.user.update({ where: { id: fresh.user.id }, data: { emailVerifiedAt: fresh.user.emailVerifiedAt ?? now } });
      const currentMembership = await tx.membership.findUnique({ where: { tenantId_userId: { tenantId: fresh.tenantId, userId: fresh.user.id } }, select: { role: true, status: true } });
      if (currentMembership?.status === "ACTIVE" && currentMembership.role !== fresh.invitation.role) throw new InvalidVerification();
      const membership = await tx.membership.upsert({ where: { tenantId_userId: { tenantId: fresh.tenantId, userId: fresh.user.id } }, create: { tenantId: fresh.tenantId, userId: fresh.user.id, role: fresh.invitation.role, status: "ACTIVE" }, update: { role: fresh.invitation.role, status: "ACTIVE" }, select: { id: true } });
      if (fresh.invitation.role === MembershipRole.GUARDIAN) {
        if (!fresh.invitation.studentId) throw new InvalidVerification();
        await tx.studentGuardian.upsert({ where: { tenantId_studentId_membershipId: { tenantId: fresh.tenantId, studentId: fresh.invitation.studentId, membershipId: membership.id } }, create: { tenantId: fresh.tenantId, studentId: fresh.invitation.studentId, membershipId: membership.id, approved: true }, update: { approved: true, revokedAt: null } });
      } else {
        if (!fresh.invitation.classroomId) throw new InvalidVerification();
        await tx.classroomStaff.upsert({ where: { tenantId_classroomId_membershipId: { tenantId: fresh.tenantId, classroomId: fresh.invitation.classroomId, membershipId: membership.id } }, create: { tenantId: fresh.tenantId, classroomId: fresh.invitation.classroomId, membershipId: membership.id }, update: {} });
      }
      await tx.emailVerification.deleteMany({ where: { userId: fresh.user.id } });
      return { userId: fresh.user.id, slug: fresh.invitation.tenant.slug, role: fresh.invitation.role };
    });
    const session = await createSession(accepted.userId);
    const destination = accepted.role === MembershipRole.GUARDIAN ? `/familia/${accepted.slug}` : `/app/${accepted.slug}/dashboard`;
    const response = NextResponse.redirect(new URL(destination, request.url), 303);
    response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: session.expiresAt });
    return response;
  } catch {
    return verificationPage(request, token, true);
  }
}
