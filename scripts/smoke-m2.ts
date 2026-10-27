import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

loadEnvFile(existsSync(".env.local") ? ".env.local" : ".env");
if (process.env.NODE_ENV === "production") throw new Error("Smoke checks are blocked in production.");
const rawUrl = process.env.DATABASE_URL;
const password = process.env.DEMO_SEED_PASSWORD;
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
if (!rawUrl || !password) throw new Error("Local DATABASE_URL and DEMO_SEED_PASSWORD are required.");
const url = new URL(rawUrl);
const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
if (url.protocol !== "mysql:" || !["localhost", "127.0.0.1", "::1"].includes(url.hostname) || !/(?:_dev|_test)$/.test(database)) throw new Error("M2 smoke requires a loopback *_dev or *_test database.");
const prisma = new PrismaClient({ adapter: new PrismaMariaDb({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database, connectionLimit: 2 }) });
const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { slug: "colegio-pilares-demo" }, select: { id: true } });
const tenantB = await prisma.tenant.findUniqueOrThrow({ where: { slug: "escola-jardim-demo" }, select: { id: true } });
const suffix = Date.now().toString();
const unitName = `Smoke M2 ${suffix}`;
const classroomName = `Smoke M2 ${suffix}`;
const firstStudentName = `Criança M2 ${suffix} A`;
const secondStudentName = `Criança M2 ${suffix} B`;
const year = new Date().getFullYear();
const unitB = await prisma.schoolUnit.findFirstOrThrow({ where: { tenantId: tenantB.id }, select: { id: true } });
const teacherB = await prisma.membership.findFirstOrThrow({ where: { tenantId: tenantB.id, role: "TEACHER", status: "ACTIVE" }, select: { id: true } });
const guardianA = await prisma.membership.findFirstOrThrow({ where: { tenantId: tenantA.id, role: "GUARDIAN", status: "ACTIVE" }, select: { id: true } });
const teacherPassword = password;

async function login() {
  const body = new URLSearchParams({ email: "admin.demo@turminha.local", password: teacherPassword, tenant: "colegio-pilares-demo" });
  const response = await fetch(`${base}/api/auth/signin`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body });
  if (response.status !== 303 || !response.headers.get("set-cookie")) throw new Error(`Admin login failed (${response.status}).`);
  return response.headers.get("set-cookie")!.split(";", 1)[0];
}

const cookie = await login();
async function submit(fields: Record<string, string>, slug = "colegio-pilares-demo") {
  const form = new URLSearchParams(fields);
  return fetch(`${base}/api/app/${slug}/gestao-escolar`, { method: "POST", redirect: "manual", headers: { origin: base, cookie, "content-type": "application/x-www-form-urlencoded" }, body: form });
}
async function requireSaved(fields: Record<string, string>) {
  const response = await submit(fields);
  const location = response.headers.get("location") ?? "";
  if (response.status !== 303 || !location.includes("saved=1")) throw new Error(`M2 action failed (${response.status}, ${location}).`);
}

let classroomId: string | undefined;
let unitId: string | undefined;
const createdStudentNames = [firstStudentName, secondStudentName];
try {
  const page = await fetch(`${base}/app/colegio-pilares-demo/gestao-escolar`, { headers: { cookie } });
  const html = await page.text();
  if (page.status !== 200 || !html.includes("Gestão escolar") || !html.includes("Unidade Principal")) throw new Error("School management screen did not render the tenant's persisted configuration.");

  await requireSaved({ action: "unit:create", name: unitName });
  const unit = await prisma.schoolUnit.findUniqueOrThrow({ where: { tenantId_name: { tenantId: tenantA.id, name: unitName } }, select: { id: true } });
  unitId = unit.id;
  await requireSaved({ action: "classroom:create", name: classroomName, schoolYear: String(year), capacity: "1", unitId: unit.id });
  const classroom = await prisma.classroom.findUniqueOrThrow({ where: { tenantId_schoolYear_name: { tenantId: tenantA.id, schoolYear: year, name: classroomName } }, select: { id: true, unitId: true } });
  classroomId = classroom.id;
  if (classroom.unitId !== unit.id) throw new Error("The classroom was not assigned to the selected tenant unit.");

  await requireSaved({ action: "student:create", classroomId: classroom.id, displayName: firstStudentName });
  await requireSaved({ action: "student:create", classroomId: classroom.id, displayName: secondStudentName });
  const enrollments = await prisma.enrollment.findMany({ where: { tenantId: tenantA.id, classroomId: classroom.id }, select: { status: true, student: { select: { displayName: true } } }, orderBy: { student: { displayName: "asc" } } });
  if (enrollments.length !== 2 || enrollments.filter((row) => row.status === "ACTIVE").length !== 1 || enrollments.filter((row) => row.status === "WAITLISTED").length !== 1) throw new Error("Capacity did not place the second learner on the waitlist.");

  const teacherA = await prisma.membership.findFirstOrThrow({ where: { tenantId: tenantA.id, role: "TEACHER", status: "ACTIVE" }, select: { id: true } });
  await requireSaved({ action: "staff:assign", classroomId: classroom.id, membershipId: teacherA.id });
  if (!await prisma.classroomStaff.findFirst({ where: { tenantId: tenantA.id, classroomId: classroom.id, membershipId: teacherA.id } })) throw new Error("The same-tenant teacher assignment was not persisted.");
  const studentForGuardian = await prisma.student.findFirstOrThrow({ where: { tenantId: tenantA.id, displayName: firstStudentName }, select: { id: true } });
  await requireSaved({ action: "guardian:link", studentId: studentForGuardian.id, membershipId: guardianA.id });
  const guardianLink = await prisma.studentGuardian.findUniqueOrThrow({ where: { tenantId_studentId_membershipId: { tenantId: tenantA.id, studentId: studentForGuardian.id, membershipId: guardianA.id } }, select: { approved: true, revokedAt: true } });
  if (guardianLink.approved || guardianLink.revokedAt) throw new Error("A school-created guardian link must remain pending family confirmation.");
  const existingApprovedLink = await prisma.studentGuardian.findFirstOrThrow({ where: { tenantId: tenantA.id, membershipId: guardianA.id, approved: true, revokedAt: null }, select: { studentId: true } });
  await requireSaved({ action: "guardian:link", studentId: existingApprovedLink.studentId, membershipId: guardianA.id });
  const preservedLink = await prisma.studentGuardian.findUniqueOrThrow({ where: { tenantId_studentId_membershipId: { tenantId: tenantA.id, studentId: existingApprovedLink.studentId, membershipId: guardianA.id } }, select: { approved: true } });
  if (!preservedLink.approved) throw new Error("Retrying a duplicate link must not silently revoke an existing guardian approval.");

  const foreignUnit = await submit({ action: "classroom:create", name: `Foreign ${suffix}`, schoolYear: String(year), capacity: "1", unitId: unitB.id });
  if (foreignUnit.status !== 403) throw new Error("Cross-tenant unit assignment was not denied.");
  const foreignStaff = await submit({ action: "staff:assign", classroomId: classroom.id, membershipId: teacherB.id });
  if (foreignStaff.status !== 403) throw new Error("Cross-tenant staff assignment was not denied.");
  const foreignTenant = await submit({ action: "unit:create", name: `Foreign ${suffix}` }, "escola-jardim-demo");
  if (foreignTenant.status !== 403) throw new Error("School admin context leaked into another tenant.");

  console.log(JSON.stringify({ managementScreen: "tenant-scoped configuration rendered", unitAndClassroom: "persisted in school A", capacity: "one active enrollment and one waitlisted", staffAssignment: "same-tenant teacher only", guardianLink: "created pending family confirmation", crossTenantUnit: "denied", crossTenantStaff: "denied", crossTenantAdmin: "denied" }));
} finally {
  if (classroomId) {
    await prisma.studentGuardian.deleteMany({ where: { tenantId: tenantA.id, student: { tenantId: tenantA.id, displayName: { in: createdStudentNames } } } });
    await prisma.enrollment.deleteMany({ where: { tenantId: tenantA.id, classroomId: classroomId } });
    await prisma.classroomStaff.deleteMany({ where: { tenantId: tenantA.id, classroomId: classroomId } });
    await prisma.student.deleteMany({ where: { tenantId: tenantA.id, displayName: { in: createdStudentNames } } });
    await prisma.classroom.deleteMany({ where: { tenantId: tenantA.id, id: classroomId, name: classroomName } });
  }
  if (unitId) await prisma.schoolUnit.deleteMany({ where: { tenantId: tenantA.id, id: unitId, name: unitName } });
  await prisma.$disconnect();
}
