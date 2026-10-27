import { NextResponse, type NextRequest } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { createSession, SESSION_COOKIE } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";

const credentials = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
  tenant: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
});

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const form = await request.formData();
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password"), tenant: form.get("tenant") });
  if (!parsed.success) return NextResponse.redirect(new URL(`/entrar?tenant=${encodeURIComponent(String(form.get("tenant") ?? ""))}&error=1`, request.url), 303);

  const tenant = await prisma.tenant.findFirst({ where: { slug: parsed.data.tenant, status: "ACTIVE" }, select: { id: true } });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() }, select: { id: true, passwordHash: true } });
  const passwordIsValid = user ? await compare(parsed.data.password, user.passwordHash) : false;
  const membership = tenant && user ? await prisma.membership.findFirst({
    where: { tenantId: tenant.id, userId: user.id, status: "ACTIVE" },
    select: { role: true },
  }) : null;
  if (!passwordIsValid || !membership || !user) return NextResponse.redirect(new URL(`/entrar?tenant=${encodeURIComponent(parsed.data.tenant)}&error=1`, request.url), 303);

  const { token, expiresAt } = await createSession(user.id);
  const response = NextResponse.redirect(new URL(membership.role === "GUARDIAN" ? `/familia/${parsed.data.tenant}` : `/app/${parsed.data.tenant}/dashboard`, request.url), 303);
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
  return response;
}
