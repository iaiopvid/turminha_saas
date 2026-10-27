import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { hash, compare } from "bcryptjs";
import { z } from "zod";
import { MembershipRole } from "@/generated/prisma/client";
import { createSession, SESSION_COOKIE } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";

const schema = z.object({ token: z.string().min(32).max(128), displayName: z.string().trim().min(2).max(100), password: z.string().min(12).max(128) });
class InvalidInvite extends Error {}
class RoleConflict extends Error {}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const form = await request.formData();
  const parsed = schema.safeParse({ token: form.get("token"), displayName: form.get("displayName"), password: form.get("password") });
  if (!parsed.success) return NextResponse.redirect(new URL("/", request.url), 303);
  const { token, displayName, password } = parsed.data;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash }, select: { email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true } });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= now) return NextResponse.redirect(new URL(`/convite/${encodeURIComponent(token)}`, request.url), 303);
  const existing = await prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true, passwordHash: true } });
  if (existing && !await compare(password, existing.passwordHash)) return NextResponse.redirect(new URL(`/convite/${encodeURIComponent(token)}?error=1`, request.url), 303);
  const passwordHash = existing ? null : await hash(password, 12);

  try {
    const accepted = await prisma.$transaction(async (tx) => {
      const fresh = await tx.invitation.findUnique({ where: { tokenHash }, select: { id: true, tenantId: true, email: true, displayName: true, role: true, studentId: true, classroomId: true, expiresAt: true, acceptedAt: true, revokedAt: true, tenant: { select: { slug: true, status: true } } } });
      if (!fresh || fresh.acceptedAt || fresh.revokedAt || fresh.expiresAt <= new Date() || fresh.tenant.status !== "ACTIVE") throw new InvalidInvite();
      const claim = await tx.invitation.updateMany({ where: { id: fresh.id, tenantId: fresh.tenantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
      if (claim.count !== 1) throw new InvalidInvite();
      const user = existing
        ? await tx.user.findUniqueOrThrow({ where: { id: existing.id }, select: { id: true } })
        : await tx.user.create({ data: { email: fresh.email, displayName, passwordHash: passwordHash! }, select: { id: true } });
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
  } catch {
    return NextResponse.redirect(new URL(`/convite/${encodeURIComponent(token)}?error=1`, request.url), 303);
  }
}
