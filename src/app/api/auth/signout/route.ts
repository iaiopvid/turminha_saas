import { NextResponse, type NextRequest } from "next/server";
import { getSessionPrincipal, revokeCurrentSession, SESSION_COOKIE } from "@/server/auth/session";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Requisição inválida.", { status: 403 });
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && await getSessionPrincipal()) await revokeCurrentSession(token);
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: new Date(0) });
  return response;
}
