import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";

loadEnvFile(existsSync(".env.local") ? ".env.local" : ".env");
if (process.env.NODE_ENV === "production") throw new Error("Smoke checks are blocked in production.");
const password = process.env.DEMO_SEED_PASSWORD;
if (!password) throw new Error("The local demo seed password is required for this smoke check.");
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

async function login(email: string, tenant: string) {
  const form = new URLSearchParams({ email, password: password!, tenant });
  const response = await fetch(`${base}/api/auth/signin`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: form });
  if (response.status !== 303) throw new Error(`Login did not redirect (${response.status}).`);
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Login did not establish an HTTP cookie session.");
  return { cookie: setCookie.split(";", 1)[0], location: new URL(response.headers.get("location")!).pathname };
}

async function page(path: string, cookie?: string) {
  const response = await fetch(`${base}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
  return { status: response.status, location: response.headers.get("location"), html: await response.text() };
}

const teacherA = await login("professora.demo@turminha.local", "colegio-pilares-demo");
if (teacherA.location !== "/app/colegio-pilares-demo/dashboard") throw new Error("Teacher did not reach the authorized school A route.");
const dashboardA = await page(teacherA.location, teacherA.cookie);
if (dashboardA.status !== 200 || !dashboardA.html.includes("3") || !dashboardA.html.includes("Um dia de cores e descobertas")) throw new Error("School A dashboard did not render persisted records.");
const teacherB = await page("/app/escola-jardim-demo/dashboard", teacherA.cookie);
if (teacherB.status !== 200 || !teacherB.html.includes("2") || !teacherB.html.includes("Bem-vindos à Turma Girassol") || teacherB.html.includes("Um dia de cores e descobertas")) throw new Error("The shared user context did not stay scoped to school B.");
const publicA = await page("/s/colegio-pilares-demo");
if (publicA.status !== 200 || !publicA.html.includes("Colégio Pilares") || !publicA.html.includes("Um dia de cores e descobertas") || publicA.html.includes("Lia Exemplo")) throw new Error("Classroom projection exposed unexpected data or missed its published notice.");
const publicB = await page("/s/escola-jardim-demo");
if (publicB.status !== 200 || !publicB.html.includes("Escola Jardim") || publicB.html.includes("Um dia de cores e descobertas")) throw new Error("Public school projections were mixed.");

const familyA = await login("familia.pilares.demo@turminha.local", "colegio-pilares-demo");
const familyPage = await page(familyA.location, familyA.cookie);
if (familyPage.status !== 200 || !familyPage.html.includes("Lia Exemplo")) throw new Error("Guardian did not reach the linked child's family space.");
const familyCrossTenant = await page("/familia/escola-jardim-demo", familyA.cookie);
if (familyCrossTenant.status !== 200 || !familyCrossTenant.html.includes("Acesso restrito") || familyCrossTenant.html.includes("Lua Exemplo")) throw new Error("Guardian was able to access another school's family data.");

console.log(JSON.stringify({ authenticatedMembership: true, teacherSchoolA: "persisted dashboard rendered", teacherSchoolB: "same account, separate tenant context", publicProjection: "published notice only; student identities hidden", guardianScope: "linked child only", crossTenantGuardianAccess: "denied" }));
