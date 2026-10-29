import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { storePrivateObjectLocally } from "../src/server/storage/s3.js";

loadEnvFile(existsSync(".env.local") ? ".env.local" : ".env");
const { normalizeDomainName, resolveVerifiedDomain, verifyDomainTxt } = await import("../src/server/tenancy/domains.js");
if (process.env.NODE_ENV === "production") throw new Error("M3 workflow smoke is blocked in production.");
const rawUrl = process.env.DATABASE_URL;
const password = process.env.DEMO_SEED_PASSWORD;
if (!rawUrl || !password) throw new Error("Local DATABASE_URL and DEMO_SEED_PASSWORD are required.");
const dbUrl = new URL(rawUrl);
const database = decodeURIComponent(dbUrl.pathname.replace(/^\//, ""));
if (dbUrl.protocol !== "mysql:" || !["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) || !/(?:_dev|_test)$/.test(database)) throw new Error("M3 workflow smoke requires a loopback *_dev or *_test database.");

const prisma = new PrismaClient({ adapter: new PrismaMariaDb({ host: dbUrl.hostname, port: Number(dbUrl.port || 3306), user: decodeURIComponent(dbUrl.username), password: decodeURIComponent(dbUrl.password), database, connectionLimit: 3 }) });
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const schoolName = `Smoke escola ${suffix}`;
const displayClass = `Turma smoke ${suffix}`;
const displayTeam = `Equipe smoke ${suffix}`;
const classroomName = `Sala smoke ${suffix}`;
const studentNames = [`Aluno smoke ${suffix} A`, `Aluno smoke ${suffix} B`];
const planTitle = `Plano smoke ${suffix}`;
const journalTitle = `Diário smoke ${suffix}`;
const schoolSlug = "colegio-pilares-demo";
const tenantBSlug = "escola-jardim-demo";
const secondGuardianEmail = `familia-smoke-${suffix}@turminha.local`;
const rateSecret = process.env.RATE_LIMIT_SECRET ?? "turminha-local-rate-limit-secret-only";
const rateKey = (scope: string, identity: string) => createHmac("sha256", rateSecret).update(`${scope}\0${identity}`).digest("hex");
const signinEmails = ["admin.demo@turminha.local", "professora.demo@turminha.local", "familia.pilares.demo@turminha.local", secondGuardianEmail];
const rateKeys = signinEmails.map((email) => rateKey("signin", email));
const priorRateBuckets = await prisma.rateLimitBucket.findMany({ where: { keyHash: { in: rateKeys } } });
const sessionTokenHashes: string[] = [];
let webProcess: ChildProcess | undefined;
let tenantId: string | undefined;
let classroomId: string | undefined;
let studentIds: string[] = [];
let enrollmentIds: string[] = [];
let familyMembershipId: string | undefined;
let secondFamilyUserId: string | undefined;
let secondFamilyMembershipId: string | undefined;
let familyStudentId: string | undefined;
let secondFamilyStudentId: string | undefined;
let secondFamilyStudentGuardianId: string | undefined;
let publicationStudentGuardianId: string | undefined;
let publicationSecondGuardianId: string | undefined;
let publicationAssetId: string | undefined;
let publicationSubmissionId: string | undefined;
let publicationStorageKey: string | undefined;
let lateGuardianUserId: string | undefined;
let lateGuardianMembershipId: string | undefined;
let lateGuardianLinkId: string | undefined;
const publicationFixtureAssetIds: string[] = [];
const publicationFixtureIds: string[] = [];
let journalEntryId: string | undefined;
let evidenceId: string | undefined;
let evidenceStorageKey: string | undefined;
const timelineFixtures: { entryId: string; evidenceId: string; shareId: string; fixtureDate: Date; title: string; storageKey: string; filename: string }[] = [];
let teacherMembershipId: string | undefined;
let adminMembershipId: string | undefined;
let originalSchool: { name: string; displayClass: string; displayTeam: string; timezone: string; publicStudents: boolean; brandPrimary: string; brandAccent: string } | undefined;
const dashboardMediaAssetIds: string[] = [];
let dashboardMediaSubmissionId: string | undefined;
let dashboardSchoolYearId: string | undefined;
let dashboardSchoolYearCreated = false;
let dashboardCalendarEntryId: string | undefined;
const bulkReviewAssetIds: string[] = [];
const bulkReviewSubmissionIds: string[] = [];
const tenantDomainHostnames: string[] = [];

async function freePort() {
  const server = createServer();
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") reject(new Error("Could not allocate a loopback port."));
      else resolve((address as AddressInfo).port);
    });
  });
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function stopChild(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32" && child.pid) spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else child.kill("SIGTERM");
}

async function waitForApp(url: string, output: () => string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (!webProcess || webProcess.exitCode !== null) throw new Error(`Temporary Next.js smoke server exited early (${webProcess?.exitCode ?? "unknown"}): ${output()}`);
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); if (response.ok) return; } catch {}
    await delay(350);
  }
  throw new Error(`Temporary Next.js smoke server did not become ready: ${output()}`);
}

async function login(base: string, email: string, tenant: string) {
  const response = await fetch(`${base}/api/auth/signin`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email, password: password!, tenant }) });
  const cookieHeader = response.headers.get("set-cookie");
  if (response.status !== 303 || !cookieHeader) throw new Error(`Smoke login failed for ${email}/${tenant} (${response.status}): ${await response.text()}`);
  const cookie = cookieHeader.split(";", 1)[0]!;
  sessionTokenHashes.push(createHash("sha256").update(cookie.slice(cookie.indexOf("=") + 1)).digest("hex"));
  return cookie;
}

async function postForm(base: string, slug: string, route: string, cookie: string, fields: Record<string, string>) {
  return fetch(`${base}/api/app/${slug}/${route}`, { method: "POST", redirect: "manual", headers: { origin: base, cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });
}

async function postBulkApproval(base: string, slug: string, cookie: string, submissionIds: string[]) {
  const form = new FormData();
  form.set("action", "APPROVED");
  for (const id of submissionIds) form.append("submissionId", id);
  return fetch(`${base}/api/app/${slug}/midias/submissions/bulk`, { method: "POST", headers: { origin: base, cookie }, body: form });
}

function requestWithHost(base: string, pathname: string, host: string, options: { method?: string; cookie?: string; origin?: string; body?: string } = {}) {
  const url = new URL(pathname, base);
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const request = httpRequest({ hostname: url.hostname, port: url.port, agent: false, path: `${url.pathname}${url.search}`, method: options.method ?? "GET", headers: { host, ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.origin ? { origin: options.origin } : {}), ...(options.body ? { "content-type": "application/x-www-form-urlencoded" } : {}) } }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") });
        response.destroy();
        request.destroy();
      });
    });
    request.once("error", reject);
    request.end(options.body);
  });
}

async function postFamilyForm(base: string, slug: string, route: string, cookie: string, fields: Record<string, string>) {
  return fetch(`${base}/api/familia/${slug}/${route}`, { method: "POST", redirect: "manual", headers: { origin: base, cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });
}

async function expectSaved(response: Response, marker = "saved=1") {
  const location = response.headers.get("location") ?? "";
  if (response.status !== 303 || !location.includes(marker)) throw new Error(`Expected saved redirect ${marker}; got ${response.status} ${location}.`);
}

try {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: schoolSlug }, select: { id: true } });
  tenantId = tenant.id;
  const tenantB = await prisma.tenant.findUniqueOrThrow({ where: { slug: tenantBSlug }, select: { id: true } });
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: signinEmails[0]! }, select: { id: true } });
  const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: signinEmails[1]! }, select: { id: true } });
  adminMembershipId = (await prisma.membership.findUniqueOrThrow({ where: { tenantId_userId: { tenantId: tenant.id, userId: adminUser.id } }, select: { id: true } })).id;
  teacherMembershipId = (await prisma.membership.findUniqueOrThrow({ where: { tenantId_userId: { tenantId: tenant.id, userId: teacherUser.id } }, select: { id: true } })).id;
  const familyUser = await prisma.user.findUniqueOrThrow({ where: { email: signinEmails[2]! }, select: { id: true } });
  familyMembershipId = (await prisma.membership.findUniqueOrThrow({ where: { tenantId_userId: { tenantId: tenant.id, userId: familyUser.id } }, select: { id: true } })).id;
  const familyPassword = (await prisma.user.findUniqueOrThrow({ where: { id: familyUser.id }, select: { passwordHash: true } })).passwordHash;
  const secondFamilyUser = await prisma.user.create({ data: { email: secondGuardianEmail, displayName: `Responsável smoke ${suffix}`, passwordHash: familyPassword } });
  secondFamilyUserId = secondFamilyUser.id;
  const secondFamilyMembership = await prisma.membership.create({ data: { tenantId: tenant.id, userId: secondFamilyUser.id, role: "GUARDIAN", status: "ACTIVE" } });
  secondFamilyMembershipId = secondFamilyMembership.id;
  const teacherBMembership = await prisma.membership.findUniqueOrThrow({ where: { tenantId_userId: { tenantId: tenantB.id, userId: teacherUser.id } }, select: { id: true } });
  const school = await prisma.school.findUniqueOrThrow({ where: { tenantId: tenant.id }, select: { name: true, displayClass: true, displayTeam: true, timezone: true, publicStudents: true, brandPrimary: true, brandAccent: true } });
  originalSchool = school;
  const buckets = await prisma.rateLimitBucket.findMany({ where: { keyHash: { in: rateKeys } } });
  priorRateBuckets.splice(0, priorRateBuckets.length, ...buckets);

  const port = await freePort();
  const base = `http://localhost:${port}`;
  const distDir = `.next-smoke-m3-workflows-${suffix}`;
  let serverOutput = "";
  webProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "development", NEXT_DIST_DIR: distDir, APP_BASE_URL: base, S3_ENDPOINT: "", S3_REGION: "", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "", CLAMAV_HOST: "", PRIVATE_STORAGE_DRIVER: "auto" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  webProcess.stdout?.setEncoding("utf8").on("data", (chunk: string) => { serverOutput += chunk; });
  webProcess.stderr?.setEncoding("utf8").on("data", (chunk: string) => { serverOutput += chunk; });
  await waitForApp(`${base}/entrar`, () => serverOutput);

  const adminCookie = await login(base, signinEmails[0]!, schoolSlug);
  const teacherCookie = await login(base, signinEmails[1]!, schoolSlug);
  const familyCookie = await login(base, signinEmails[2]!, schoolSlug);
  const secondFamilyCookie = await login(base, signinEmails[3]!, schoolSlug);

  const classroomResponse = await postForm(base, schoolSlug, "gestao-escolar", adminCookie, { action: "classroom:create", name: classroomName, schoolYear: String(new Date().getFullYear()), capacity: "2", unitId: "" });
  await expectSaved(classroomResponse);
  const classroom = await prisma.classroom.findFirstOrThrow({ where: { tenantId: tenant.id, name: classroomName }, select: { id: true, capacity: true, status: true } });
  classroomId = classroom.id;
  if (classroom.capacity !== 2 || classroom.status !== "ACTIVE") throw new Error("Classroom creation did not persist capacity/status.");

  for (const displayName of studentNames) {
    await expectSaved(await postForm(base, schoolSlug, "gestao-escolar", adminCookie, { action: "student:create", displayName, classroomId: classroom.id }));
  }
  const enrollments = await prisma.enrollment.findMany({ where: { tenantId: tenant.id, classroomId: classroom.id }, select: { id: true, studentId: true }, orderBy: { student: { displayName: "asc" } } });
  studentIds = enrollments.map((item) => item.studentId);
  familyStudentId = studentIds[0];
  secondFamilyStudentId = studentIds[1];
  enrollmentIds = enrollments.map((item) => item.id);
  if (enrollments.length !== 2) throw new Error("Student creation did not persist both same-tenant enrollments.");
  await prisma.studentGuardian.create({ data: { tenantId: tenant.id, studentId: familyStudentId!, membershipId: familyMembershipId!, approved: true } });
  secondFamilyStudentGuardianId = (await prisma.studentGuardian.create({ data: { tenantId: tenant.id, studentId: secondFamilyStudentId!, membershipId: secondFamilyMembershipId!, approved: true } })).id;
  await expectSaved(await postForm(base, schoolSlug, "gestao-escolar", adminCookie, { action: "staff:assign", classroomId: classroom.id, membershipId: teacherMembershipId! }));
  const classHtml = await (await fetch(`${base}/app/${schoolSlug}/gestao-escolar`, { headers: { cookie: adminCookie } })).text();
  const rosterHtml = await (await fetch(`${base}/app/${schoolSlug}/turma?classroomId=${classroom.id}`, { headers: { cookie: teacherCookie } })).text();
  if (!classHtml.includes(classroomName) || !studentNames.every((name) => rosterHtml.includes(name)) || !rosterHtml.includes('class="student-avatar"') || !rosterHtml.includes("<svg") || /<img\b[^>]*\bsrc=["']https?:/i.test(rosterHtml)) throw new Error("The persisted roster did not render with a neutral local avatar placeholder and no shared remote student photo.");

  const dashboardToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const dashboardStart = new Date(`${dashboardToday}T00:00:00.000Z`);
  const dashboardEnd = new Date(`${dashboardToday}T23:59:59.999Z`);
  const photoFixtures = [
    { id: `dashphoto-${randomBytes(7).toString("hex")}`, title: "Foto escolar aprovada", classroomId: classroom.id, studentId: studentIds[0]!, uploadedByMembershipId: teacherMembershipId!, status: "PUBLISHED", scanStatus: "CLEAN", contentType: "image/webp" },
    { id: `dashphoto-${randomBytes(7).toString("hex")}`, title: "Foto escolar recente", classroomId: classroom.id, studentId: studentIds[1]!, uploadedByMembershipId: teacherMembershipId!, status: "PENDING", scanStatus: "CLEAN", contentType: "image/png" },
    { id: `dashphoto-${randomBytes(7).toString("hex")}`, title: "Álbum privado da família", classroomId: null, studentId: studentIds[0]!, uploadedByMembershipId: familyMembershipId!, status: "PRIVATE", scanStatus: "CLEAN", contentType: "image/webp" },
    { id: `dashphoto-${randomBytes(7).toString("hex")}`, title: "Vídeo escolar", classroomId: classroom.id, studentId: studentIds[0]!, uploadedByMembershipId: teacherMembershipId!, status: "PUBLISHED", scanStatus: "CLEAN", contentType: "video/mp4" },
    { id: `dashphoto-${randomBytes(7).toString("hex")}`, title: "Imagem em quarentena", classroomId: classroom.id, studentId: studentIds[0]!, uploadedByMembershipId: teacherMembershipId!, status: "QUARANTINED", scanStatus: "PENDING", contentType: "image/webp" },
    { id: `dashphoto-${randomBytes(7).toString("hex")}`, title: "Envio familiar aprovado", classroomId: null, studentId: studentIds[0]!, uploadedByMembershipId: familyMembershipId!, status: "PRIVATE", scanStatus: "CLEAN", contentType: "image/webp" },
  ];
  dashboardMediaAssetIds.push(...photoFixtures.map((fixture) => fixture.id));
  await prisma.mediaAsset.createMany({ data: photoFixtures.map((fixture) => ({ ...fixture, tenantId: tenant.id, category: "ACTIVITY" as const, storageKey: `${tenant.id}/${fixture.id}`, createdAt: new Date() })) });
  const privateFamilyAsset = photoFixtures[2]!;
  const sharedFamilyAsset = photoFixtures[5]!;
  await prisma.mediaConsent.createMany({ data: [
    { tenantId: tenant.id, mediaAssetId: privateFamilyAsset.id, membershipId: familyMembershipId!, purpose: "PRIVATE_STORAGE" },
    { tenantId: tenant.id, mediaAssetId: sharedFamilyAsset.id, membershipId: familyMembershipId!, purpose: "PRIVATE_STORAGE" },
    { tenantId: tenant.id, mediaAssetId: sharedFamilyAsset.id, membershipId: familyMembershipId!, purpose: "SCHOOL_REVIEW" },
  ] });
  dashboardMediaSubmissionId = `dashsub-${randomBytes(7).toString("hex")}`;
  await prisma.mediaSubmission.create({ data: { id: dashboardMediaSubmissionId, tenantId: tenant.id, mediaAssetId: sharedFamilyAsset.id, studentId: studentIds[0]!, submittedByMembershipId: familyMembershipId!, reviewerMembershipId: adminMembershipId!, status: "APPROVED", reviewedAt: new Date() } });
  const dashboardHtml = await (await fetch(`${base}/app/${schoolSlug}/dashboard?classroomId=${classroom.id}`, { headers: { cookie: teacherCookie } })).text();
  const photoLabelIndex = dashboardHtml.indexOf("Fotos adicionadas");
  const photosCardHtml = dashboardHtml.slice(Math.max(0, photoLabelIndex - 350), photoLabelIndex + 250);
  if (!dashboardHtml.includes("Chamada") || !dashboardHtml.includes("registrada") || !/—\/2/.test(dashboardHtml) || !/<strong[^>]*>3<\/strong>/.test(photosCardHtml)) throw new Error("Dashboard rendered a false attendance value or counted private-family, video, quarantined, or unapproved media incorrectly.");

  let smokeSchoolYear = await prisma.schoolYear.findUnique({ where: { tenantId_year: { tenantId: tenant.id, year: new Date().getFullYear() } }, select: { id: true } });
  if (!smokeSchoolYear) {
    smokeSchoolYear = await prisma.schoolYear.create({ data: { tenantId: tenant.id, year: new Date().getFullYear(), startsOn: new Date(`${new Date().getFullYear()}-01-01T00:00:00.000Z`), endsOn: new Date(`${new Date().getFullYear()}-12-31T00:00:00.000Z`) }, select: { id: true } });
    dashboardSchoolYearCreated = true;
  }
  dashboardSchoolYearId = smokeSchoolYear.id;
  dashboardCalendarEntryId = `dashcal-${randomBytes(7).toString("hex")}`;
  await prisma.calendarEntry.create({ data: { id: dashboardCalendarEntryId, tenantId: tenant.id, schoolYearId: dashboardSchoolYearId, createdByMembershipId: adminMembershipId!, kind: "HOLIDAY", title: `Feriado smoke ${suffix}`, startsOn: dashboardStart, endsOn: dashboardStart } });
  const holidayDashboardHtml = await (await fetch(`${base}/app/${schoolSlug}/dashboard?classroomId=${classroom.id}`, { headers: { cookie: teacherCookie } })).text();
  if (!holidayDashboardHtml.includes("Sem aula prevista") || !holidayDashboardHtml.includes(`Feriado smoke ${suffix}`) || /—\/2/.test(holidayDashboardHtml)) throw new Error("Dashboard did not replace the attendance fraction with the configured school holiday state.");
  await prisma.calendarEntry.deleteMany({ where: { tenantId: tenant.id, id: dashboardCalendarEntryId } });
  dashboardCalendarEntryId = undefined;

  await prisma.attendance.create({ data: { tenantId: tenant.id, enrollmentId: enrollmentIds[1]!, classDate: dashboardStart, status: "ABSENT", recordedBy: adminMembershipId! } });
  const partialDashboardHtml = await (await fetch(`${base}/app/${schoolSlug}/dashboard?classroomId=${classroom.id}`, { headers: { cookie: teacherCookie } })).text();
  if (!partialDashboardHtml.includes("1 sem registro · 1 ausência(s)") || !/0\/2/.test(partialDashboardHtml) || /0\/2[^<]*%/.test(partialDashboardHtml)) throw new Error("Partial attendance did not show unmarked students separately without presenting a false percentage.");
  await prisma.attendance.create({ data: { tenantId: tenant.id, enrollmentId: enrollmentIds[0]!, classDate: dashboardStart, status: "PRESENT", recordedBy: adminMembershipId! } });
  const completeDashboardHtml = await (await fetch(`${base}/app/${schoolSlug}/dashboard?classroomId=${classroom.id}`, { headers: { cookie: teacherCookie } })).text();
  if (!completeDashboardHtml.includes("chamada completa") || !/1\/2/.test(completeDashboardHtml)) throw new Error("Complete attendance did not render its final present/active count.");
  const today = dashboardToday;
  const periodStart = today;
  const periodEnd = today;
  const draftResponse = await postForm(base, schoolSlug, "pedagogia", teacherCookie, { action: "create", classroomId: classroom.id, title: planTitle, ageGroup: "Maternal demonstrativo", periodStart, periodEnd, durationMinutes: "30", materials: "Papel e tintas", intentions: "Explorar cores e formas em uma atividade coletiva." });
  await expectSaved(draftResponse, "saved=draft");
  const plan = await prisma.learningPlan.findFirstOrThrow({ where: { tenantId: tenant.id, classroomId: classroom.id, title: planTitle }, select: { id: true, status: true, version: true } });
  if (plan.status !== "DRAFT" || plan.version !== 1) throw new Error("Learning plan draft/version did not persist.");
  await expectSaved(await postForm(base, schoolSlug, "pedagogia", teacherCookie, { action: "submit", planId: plan.id }), "saved=submitted");
  if ((await prisma.learningPlan.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenant.id, id: plan.id } }, select: { status: true } })).status !== "SUBMITTED") throw new Error("Plan submission transition failed.");
  await expectSaved(await postForm(base, schoolSlug, "pedagogia", adminCookie, { action: "decide", planId: plan.id, decision: "approve", reviewComment: "" }), "saved=approved");
  if ((await prisma.learningPlan.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenant.id, id: plan.id } }, select: { status: true, reviewerMembershipId: true } })).status !== "APPROVED") throw new Error("Plan review approval did not persist.");

  const idempotencyKey = randomUUID();
  const diaryFields = { classroomId: classroom.id, idempotencyKey, happenedAt: today, title: journalTitle, description: "Atividade realizada para validar o diário e a chave idempotente.", materials: "", learningPlanId: plan.id, participantEnrollmentId: enrollmentIds[0]!, [`observation:${enrollmentIds[0]}`]: "Explorou os materiais e compartilhou a descoberta." };
  const diaryResponse = await postForm(base, schoolSlug, "diario", teacherCookie, diaryFields);
  const diaryLocation = diaryResponse.headers.get("location") ?? "";
  if (diaryResponse.status !== 303 || !diaryLocation.includes("saved=1")) throw new Error(`Diary creation failed (${diaryResponse.status} ${diaryLocation}). Server output: ${serverOutput.slice(-2500)}`);
  await expectSaved(await postForm(base, schoolSlug, "diario", teacherCookie, diaryFields));
  const persistedEntries = await prisma.journalEntry.findMany({ where: { tenantId: tenant.id, authorMembershipId: teacherMembershipId, idempotencyKey }, select: { id: true, learningPlanId: true, participants: { select: { enrollmentId: true, observation: true } } } });
  if (persistedEntries.length !== 1 || persistedEntries[0]!.learningPlanId !== plan.id || persistedEntries[0]!.participants[0]?.enrollmentId !== enrollmentIds[0] || persistedEntries[0]!.participants[0]?.observation !== "Explorou os materiais e compartilhou a descoberta.") throw new Error("Diary retry duplicated the record or lost its approved plan, participant or individual observation.");
  journalEntryId = persistedEntries[0]!.id;
  const absentFields = { ...diaryFields, idempotencyKey: randomUUID(), participantEnrollmentId: enrollmentIds[1]!, [`observation:${enrollmentIds[0]}`]: "" };
  const absentResponse = await postForm(base, schoolSlug, "diario", teacherCookie, absentFields);
  if (absentResponse.status !== 303 || !absentResponse.headers.get("location")?.includes("error=participant-scope")) throw new Error("Absent student was accepted in a diary activity.");
  await prisma.attendance.updateMany({ where: { tenantId: tenant.id, enrollmentId: enrollmentIds[1]!, classDate: new Date(`${today}T00:00:00.000Z`), status: "ABSENT" }, data: { status: "PRESENT" } });
  await prisma.journalParticipant.create({ data: { tenantId: tenant.id, journalEntryId, enrollmentId: enrollmentIds[1]! } });
  evidenceId = `evidence-${randomBytes(8).toString("hex")}`;
  const evidenceBytes = Buffer.from("private family-consent smoke evidence");
  evidenceStorageKey = await storePrivateObjectLocally({ key: `${tenant.id}/${evidenceId}`, bytes: evidenceBytes });
  await prisma.journalEvidence.create({ data: { id: evidenceId, tenantId: tenant.id, journalEntryId, uploadedByMembershipId: teacherMembershipId!, storageKey: evidenceStorageKey, originalFilename: "evidencia-smoke.webp", contentType: "image/webp", byteSize: evidenceBytes.length, checksumSha256: createHash("sha256").update(evidenceBytes).digest("hex"), scanStatus: "CLEAN", status: "PRIVATE" } });
  const preConsentDownload = await fetch(`${base}/api/familia/${schoolSlug}/evidencias/missing-share`, { headers: { cookie: familyCookie } });
  if (preConsentDownload.status !== 404) throw new Error("Family evidence endpoint did not deny an unknown share before consent.");
  await expectSaved(await postForm(base, schoolSlug, `diario/${journalEntryId}/evidencias/${evidenceId}/compartilhamento`, teacherCookie, { enrollmentId: enrollmentIds[0]! }), "shareRequested=1");
  const share = await prisma.journalEvidenceFamilyShare.findFirstOrThrow({ where: { tenantId: tenant.id, journalEvidenceId: evidenceId, enrollmentId: enrollmentIds[0]!, closedAt: null }, select: { id: true } });
  await expectSaved(await postForm(base, schoolSlug, `diario/${journalEntryId}/evidencias/${evidenceId}/compartilhamento`, teacherCookie, { enrollmentId: enrollmentIds[1]! }), "shareRequested=1");
  const secondShare = await prisma.journalEvidenceFamilyShare.findFirstOrThrow({ where: { tenantId: tenant.id, journalEvidenceId: evidenceId, enrollmentId: enrollmentIds[1]!, closedAt: null }, select: { id: true } });
  const familyPendingHtml = await (await fetch(`${base}/familia/${schoolSlug}`, { headers: { cookie: familyCookie } })).text();
  if (!familyPendingHtml.includes(journalTitle) || familyPendingHtml.includes(`href="/api/familia/${schoolSlug}/evidencias/${share.id}"`)) throw new Error("Family request was hidden or its file was exposed before consent.");
  const secondFamilyPendingHtml = await (await fetch(`${base}/familia/${schoolSlug}`, { headers: { cookie: secondFamilyCookie } })).text();
  if (!secondFamilyPendingHtml.includes(journalTitle) || secondFamilyPendingHtml.includes(`href="/api/familia/${schoolSlug}/evidencias/${secondShare.id}"`)) throw new Error("Second family could not see its scoped request or saw the file too early.");
  const grantFamilyA = () => postFamilyForm(base, schoolSlug, `evidencias/${share.id}/consentimento`, familyCookie, { action: "grant", termsAccepted: "yes" });
  const [consentPost, concurrentGrant] = await Promise.all([grantFamilyA(), grantFamilyA()]);
  if ([consentPost, concurrentGrant].some((response) => response.status !== 303)) throw new Error("Concurrent consent requests did not complete safely.");
  const firstGuardianGrants = await prisma.journalEvidenceFamilyConsent.count({ where: { tenantId: tenant.id, shareId: share.id, membershipId: familyMembershipId, action: "GRANTED" } });
  if (firstGuardianGrants !== 1) throw new Error("Concurrent duplicate grants created multiple active consent events.");
  const blockedUntilAllGuardians = await fetch(`${base}/api/familia/${schoolSlug}/evidencias/${share.id}`, { headers: { cookie: familyCookie } });
  const pendingAfterFirstConsent = await (await fetch(`${base}/familia/${schoolSlug}`, { headers: { cookie: familyCookie } })).text();
  if (blockedUntilAllGuardians.status !== 404 || !pendingAfterFirstConsent.includes("Aguardando os demais responsáveis") || pendingAfterFirstConsent.includes(`href="/api/familia/${schoolSlug}/evidencias/${share.id}"`)) throw new Error("One household consented but the multi-child evidence was not kept blocked for other households.");
  const timelineBeforeFullConsent = await (await fetch(`${base}/api/familia/${schoolSlug}/timeline`, { headers: { cookie: familyCookie } })).json() as { items: { entryId: string }[] };
  if (timelineBeforeFullConsent.items.some((item) => item.entryId === journalEntryId)) throw new Error("Family timeline exposed an entry before every participant household consented.");
  const grantFamilyB = () => postFamilyForm(base, schoolSlug, `evidencias/${secondShare.id}/consentimento`, secondFamilyCookie, { action: "grant", termsAccepted: "yes" });
  const [secondGrant, duplicateSecondGrant] = await Promise.all([grantFamilyB(), grantFamilyB()]);
  if ([secondGrant, duplicateSecondGrant].some((response) => response.status !== 303)) throw new Error("Concurrent second-family consent requests did not complete safely.");
  const secondGuardianGrants = await prisma.journalEvidenceFamilyConsent.count({ where: { tenantId: tenant.id, shareId: secondShare.id, membershipId: secondFamilyMembershipId, action: "GRANTED" } });
  if (secondGuardianGrants !== 1) throw new Error("Concurrent second-family grants created duplicate consent events.");
  const [timelineA, timelineB] = await Promise.all([
    fetch(`${base}/api/familia/${schoolSlug}/timeline`, { headers: { cookie: familyCookie } }).then((response) => response.json() as Promise<{ items: { entryId: string; shareId: string }[] }>),
    fetch(`${base}/api/familia/${schoolSlug}/timeline`, { headers: { cookie: secondFamilyCookie } }).then((response) => response.json() as Promise<{ items: { entryId: string; shareId: string }[] }>),
  ]);
  if (!timelineA.items.some((item) => item.entryId === journalEntryId && item.shareId === share.id) || !timelineB.items.some((item) => item.entryId === journalEntryId && item.shareId === secondShare.id)) throw new Error("Authorized family timeline did not expose persisted evidence to each linked household.");
  const foreignCursor = Buffer.from(JSON.stringify({ tenantId: tenant.id, membershipId: secondFamilyMembershipId, filter: "authorized-evidence-v1", at: new Date().toISOString(), id: journalEntryId })).toString("base64url");
  const rejectedCursor = await (await fetch(`${base}/api/familia/${schoolSlug}/timeline?cursor=${encodeURIComponent(foreignCursor)}`, { headers: { cookie: familyCookie } })).json() as { items: { entryId: string }[] };
  if (rejectedCursor.items.length) throw new Error("Family timeline accepted a cursor bound to another membership.");
  const fixtureChecksum = createHash("sha256").update("x").digest("hex");
  for (let index = 0; index < 13; index++) {
    const fixtureDate = new Date(`${today}T00:00:00.000Z`);
    fixtureDate.setUTCDate(fixtureDate.getUTCDate() - index - 1);
    const fixtureEvidenceId = `timeline-${randomBytes(9).toString("hex")}`;
    timelineFixtures.push({ entryId: `time-entry-${randomBytes(7).toString("hex")}`, evidenceId: fixtureEvidenceId, shareId: `timeline-share-${randomBytes(7).toString("hex")}`, fixtureDate, title: `${journalTitle} timeline ${index + 1}`, storageKey: `${tenant.id}/${fixtureEvidenceId}`, filename: `timeline-${index + 1}.webp` });
  }
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.createMany({ data: timelineFixtures.map((fixture) => ({ id: fixture.entryId, tenantId: tenant.id, classroomId: classroom.id, authorMembershipId: teacherMembershipId!, idempotencyKey: randomUUID(), happenedAt: fixture.fixtureDate, title: fixture.title, description: "Fixture de paginação da timeline familiar.", status: "RECORDED" })) });
    await tx.journalParticipant.createMany({ data: timelineFixtures.map((fixture) => ({ tenantId: tenant.id, journalEntryId: fixture.entryId, enrollmentId: enrollmentIds[0]! })) });
    await tx.journalEvidence.createMany({ data: timelineFixtures.map((fixture) => ({ id: fixture.evidenceId, tenantId: tenant.id, journalEntryId: fixture.entryId, uploadedByMembershipId: teacherMembershipId!, storageKey: fixture.storageKey, originalFilename: fixture.filename, contentType: "image/webp", byteSize: 1, checksumSha256: fixtureChecksum, scanStatus: "CLEAN", status: "PRIVATE" })) });
    await tx.journalEvidenceFamilyShare.createMany({ data: timelineFixtures.map((fixture) => ({ id: fixture.shareId, tenantId: tenant.id, journalEvidenceId: fixture.evidenceId, enrollmentId: enrollmentIds[0]!, requestedByMembershipId: teacherMembershipId! })) });
    await tx.journalEvidenceFamilyConsent.createMany({ data: timelineFixtures.map((fixture) => ({ tenantId: tenant.id, shareId: fixture.shareId, membershipId: familyMembershipId!, action: "GRANTED", termsVersion: "family-evidence-v1" })) });
  });
  const timelinePageOne = await (await fetch(`${base}/api/familia/${schoolSlug}/timeline`, { headers: { cookie: familyCookie } })).json() as { items: { entryId: string }[]; nextCursor: string | null; hasMore: boolean };
  if (timelinePageOne.items.length !== 12 || !timelinePageOne.hasMore || !timelinePageOne.nextCursor || new Set(timelinePageOne.items.map((item) => item.entryId)).size !== 12) throw new Error("Family timeline did not return its first distinct server page of 12 entries.");
  const deferredFixture = timelineFixtures.find((fixture) => !timelinePageOne.items.some((item) => item.entryId === fixture.entryId));
  if (!deferredFixture) throw new Error("The first timeline page did not leave a fixture for the next-page revocation test.");
  await prisma.journalEvidenceFamilyConsent.create({ data: { tenantId: tenant.id, shareId: deferredFixture.shareId, membershipId: familyMembershipId!, action: "REVOKED", termsVersion: "family-evidence-v1" } });
  const timelinePageTwo = await (await fetch(`${base}/api/familia/${schoolSlug}/timeline?cursor=${encodeURIComponent(timelinePageOne.nextCursor)}`, { headers: { cookie: familyCookie } })).json() as { items: { entryId: string }[]; nextCursor: string | null; hasMore: boolean };
  const combinedTimelineIds = [...timelinePageOne.items.map((item) => item.entryId), ...timelinePageTwo.items.map((item) => item.entryId)];
  if (timelinePageTwo.items.some((item) => item.entryId === deferredFixture.entryId) || timelinePageTwo.hasMore || timelinePageTwo.nextCursor || combinedTimelineIds.length !== 13 || new Set(combinedTimelineIds).size !== combinedTimelineIds.length) throw new Error("Timeline pagination duplicated/skipped live entries or retained an item revoked between pages.");
  const [familyDownload, secondFamilyDownload] = await Promise.all([
    fetch(`${base}/api/familia/${schoolSlug}/evidencias/${share.id}`, { headers: { cookie: familyCookie } }),
    fetch(`${base}/api/familia/${schoolSlug}/evidencias/${secondShare.id}`, { headers: { cookie: secondFamilyCookie } }),
  ]);
  if (familyDownload.status !== 200 || secondFamilyDownload.status !== 200 || Buffer.from(await familyDownload.arrayBuffer()).compare(evidenceBytes) !== 0 || Buffer.from(await secondFamilyDownload.arrayBuffer()).compare(evidenceBytes) !== 0) throw new Error("Evidence was not delivered to each household after every guardian consented.");
  const [concurrentDecisionA, concurrentDecisionB] = await Promise.all([
    postFamilyForm(base, schoolSlug, `evidencias/${share.id}/consentimento`, familyCookie, { action: "grant", termsAccepted: "yes" }),
    postFamilyForm(base, schoolSlug, `evidencias/${share.id}/consentimento`, familyCookie, { action: "revoke" }),
  ]);
  if (concurrentDecisionA.status !== 303 || concurrentDecisionB.status !== 303) throw new Error("Concurrent grant/revoke decisions did not complete safely.");
  let latestDecision = await prisma.journalEvidenceFamilyConsent.findFirstOrThrow({ where: { tenantId: tenant.id, shareId: share.id, membershipId: familyMembershipId }, select: { action: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (latestDecision.action === "REVOKED") {
    const restoreConsent = await postFamilyForm(base, schoolSlug, `evidencias/${share.id}/consentimento`, familyCookie, { action: "grant", termsAccepted: "yes" });
    if (restoreConsent.status !== 303) throw new Error("Could not restore consent after concurrent-decision verification.");
  }
  const accessAfterConcurrentDecisions = await fetch(`${base}/api/familia/${schoolSlug}/evidencias/${share.id}`, { headers: { cookie: familyCookie } });
  if (accessAfterConcurrentDecisions.status !== 200) throw new Error("Concurrent grant/revoke decisions left consent state inconsistent.");
  await accessAfterConcurrentDecisions.arrayBuffer();
  await expectSaved(await postForm(base, schoolSlug, `diario/${journalEntryId}/evidencias/${evidenceId}/compartilhamento`, teacherCookie, { action: "close", enrollmentId: enrollmentIds[0]! }), "shareClosed=1");
  const afterCloseDownload = await fetch(`${base}/api/familia/${schoolSlug}/evidencias/${share.id}`, { headers: { cookie: familyCookie } });
  const secondAfterCloseDownload = await fetch(`${base}/api/familia/${schoolSlug}/evidencias/${secondShare.id}`, { headers: { cookie: secondFamilyCookie } });
  if (afterCloseDownload.status !== 404 || secondAfterCloseDownload.status !== 404) throw new Error("Closing one child's share did not block a multi-child family download for every household.");
  await expectSaved(await postForm(base, schoolSlug, `diario/${journalEntryId}/evidencias/${evidenceId}/compartilhamento`, teacherCookie, { enrollmentId: enrollmentIds[0]! }), "shareRequested=1");
  const reopenedFamilyHtml = await (await fetch(`${base}/familia/${schoolSlug}`, { headers: { cookie: familyCookie } })).text();
  if (!reopenedFamilyHtml.includes("Aguardando sua decisão") || reopenedFamilyHtml.includes(`href="/api/familia/${schoolSlug}/evidencias/${share.id}"`)) throw new Error("Reopening a request restored old consent or exposed the file prematurely.");
  const regrantPost = await postFamilyForm(base, schoolSlug, `evidencias/${share.id}/consentimento`, familyCookie, { action: "grant", termsAccepted: "yes" });
  if (regrantPost.status !== 303 || !regrantPost.headers.get("location")?.includes("evidenceConsent=granted")) throw new Error("A reopened request did not require fresh consent.");
  const regrantedDownload = await fetch(`${base}/api/familia/${schoolSlug}/evidencias/${share.id}`, { headers: { cookie: familyCookie } });
  if (regrantedDownload.status !== 200 || Buffer.from(await regrantedDownload.arrayBuffer()).compare(evidenceBytes) !== 0) throw new Error("Evidence was not available after the renewed consent.");
  const [downloadRacingRevocation, linkRevocation] = await Promise.all([
    fetch(`${base}/api/familia/${schoolSlug}/evidencias/${secondShare.id}`, { headers: { cookie: secondFamilyCookie } }),
    prisma.studentGuardian.updateMany({ where: { tenantId: tenant.id, id: secondFamilyStudentGuardianId!, approved: true, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  if (linkRevocation.count !== 1 || ![200, 404].includes(downloadRacingRevocation.status)) throw new Error("Guardian-link revocation race produced an invalid result.");
  const afterLinkRevocation = await fetch(`${base}/api/familia/${schoolSlug}/evidencias/${secondShare.id}`, { headers: { cookie: secondFamilyCookie } });
  if (afterLinkRevocation.status !== 404) throw new Error("Revoking a guardian link did not block subsequent evidence downloads.");
  const timelineAfterRevocation = await (await fetch(`${base}/api/familia/${schoolSlug}/timeline`, { headers: { cookie: familyCookie } })).json() as { items: { entryId: string }[] };
  if (timelineAfterRevocation.items.some((item) => item.entryId === journalEntryId)) throw new Error("Family timeline retained evidence after one participant's guardian link was revoked.");
  const revokePost = await postFamilyForm(base, schoolSlug, `evidencias/${share.id}/consentimento`, familyCookie, { action: "revoke" });
  if (revokePost.status !== 303 || !revokePost.headers.get("location")?.includes("evidenceConsent=revoked")) throw new Error("Family evidence consent could not be withdrawn.");
  const afterRevoke = await fetch(`${base}/api/familia/${schoolSlug}/evidencias/${share.id}`, { headers: { cookie: familyCookie } });
  const consentHistory = await prisma.journalEvidenceFamilyConsent.findMany({ where: { tenantId: tenant.id, shareId: share.id, membershipId: familyMembershipId }, select: { action: true }, orderBy: { createdAt: "asc" } });
  if (afterRevoke.status !== 404 || consentHistory.length < 5 || consentHistory[0]?.action !== "GRANTED" || consentHistory.at(-1)?.action !== "REVOKED") throw new Error("Consent withdrawal did not block access or preserve its append-only audit trail.");
  const conflictFields = { ...diaryFields, title: `${journalTitle} alterado` };
  const conflictResponse = await postForm(base, schoolSlug, "diario", teacherCookie, conflictFields);
  if (conflictResponse.status !== 303 || !conflictResponse.headers.get("location")?.includes("error=save")) throw new Error("Idempotency key with divergent payload was not rejected.");
  const diaryHtml = await (await fetch(`${base}/app/${schoolSlug}/diario?classroomId=${classroom.id}`, { headers: { cookie: teacherCookie } })).text();
  if (!diaryHtml.includes(journalTitle) || !diaryHtml.includes(planTitle)) throw new Error("Diary did not render the saved execution and approved-plan relationship.");
  const pedagogyResponse = await fetch(`${base}/app/${schoolSlug}/pedagogia?classroomId=${classroom.id}`, { headers: { cookie: teacherCookie } });
  const pedagogyHtml = await pedagogyResponse.text();
  if (!pedagogyHtml.includes(planTitle) || !pedagogyHtml.includes("Aprovado") || !pedagogyHtml.includes(journalTitle) || !pedagogyHtml.includes("Explorou os materiais e compartilhou a descoberta.")) throw new Error(`Pedagogy screen missed the persisted journal timeline (HTTP ${pedagogyResponse.status}; plan=${pedagogyHtml.includes(planTitle)}; approved=${pedagogyHtml.includes("Aprovado")}; entry=${pedagogyHtml.includes(journalTitle)}; observation=${pedagogyHtml.includes("Explorou os materiais e compartilhou a descoberta.")}). ${serverOutput.slice(-1800)}`);
  const filteredPedagogyHtml = await (await fetch(`${base}/app/${schoolSlug}/pedagogia?classroomId=${classroom.id}&timelineFrom=${today}&timelineTo=${today}`, { headers: { cookie: teacherCookie } })).text();
  if (!filteredPedagogyHtml.includes(journalTitle) || filteredPedagogyHtml.includes(timelineFixtures[0]!.title)) throw new Error("Pedagogical timeline date filters did not retain only entries in the selected period.");
  const timelineFromDate = new Date(`${today}T00:00:00.000Z`);
  timelineFromDate.setUTCDate(timelineFromDate.getUTCDate() - 13);
  const rangeStart = timelineFromDate.toISOString().slice(0, 10);
  const teamTimelineQuery = new URLSearchParams({ classroomId: classroom.id, timelineFrom: rangeStart, timelineTo: today, timelineEnrollmentId: enrollmentIds[0]! });
  const teamTimelinePageOne = await (await fetch(`${base}/app/${schoolSlug}/pedagogia?${teamTimelineQuery}`, { headers: { cookie: teacherCookie } })).text();
  const pageTwoHref = teamTimelinePageOne.match(/href="([^"]*timelinePage=2[^"]*)"/)?.[1]?.replaceAll("&amp;", "&");
  if (!pageTwoHref) throw new Error("Team timeline did not render a page-two link for 14 matching records.");
  const pageTwoUrl = new URL(pageTwoHref, base);
  if (pageTwoUrl.searchParams.get("timelineFrom") !== rangeStart || pageTwoUrl.searchParams.get("timelineTo") !== today || pageTwoUrl.searchParams.get("timelineEnrollmentId") !== enrollmentIds[0]) throw new Error("Team timeline pagination link did not preserve its date/student filters.");
  const teamTimelinePageTwo = await (await fetch(pageTwoUrl, { headers: { cookie: teacherCookie } })).text();
  if (!teamTimelinePageTwo.includes(timelineFixtures[12]!.title)) throw new Error("Team timeline page two did not render the last matching diary entry.");
  const clampedTimelineUrl = new URL(pageTwoUrl);
  clampedTimelineUrl.searchParams.set("timelinePage", "999");
  const clampedTeamTimeline = await (await fetch(clampedTimelineUrl, { headers: { cookie: teacherCookie } })).text();
  if (!clampedTeamTimeline.includes(timelineFixtures[12]!.title)) throw new Error("An out-of-range team timeline page was not clamped to the last valid page.");
  const planFilteredTimeline = await (await fetch(`${base}/app/${schoolSlug}/pedagogia?classroomId=${classroom.id}&timelinePlanId=${plan.id}`, { headers: { cookie: teacherCookie } })).text();
  if (!planFilteredTimeline.includes(journalTitle) || planFilteredTimeline.includes(timelineFixtures[0]!.title)) throw new Error("Team timeline learning-plan filter did not select only entries linked to that plan.");
  const foreignClassroom = await prisma.classroom.findFirst({ where: { tenantId: tenantB.id }, select: { id: true } });
  if (foreignClassroom) {
    const foreignClassPedagogyHtml = await (await fetch(`${base}/app/${schoolSlug}/pedagogia?classroomId=${foreignClassroom.id}`, { headers: { cookie: teacherCookie } })).text();
    if (foreignClassPedagogyHtml.includes(journalTitle)) throw new Error("Teacher timeline exposed a record when given a classroom ID from another tenant.");
  }

  const updatedSchool = { name: schoolName, displayClass, displayTeam, timezone: "America/Sao_Paulo", publicStudents: "false", brandPrimary: "#1967C0", brandAccent: "#F5A623" };
  await expectSaved(await postForm(base, schoolSlug, "configuracoes", adminCookie, updatedSchool));
  const savedSchool = await prisma.school.findUniqueOrThrow({ where: { tenantId: tenant.id }, select: { name: true, displayClass: true, displayTeam: true, timezone: true, publicStudents: true, brandPrimary: true, brandAccent: true } });
  if (savedSchool.name !== schoolName || savedSchool.displayClass !== displayClass || savedSchool.displayTeam !== displayTeam || savedSchool.timezone !== updatedSchool.timezone || savedSchool.brandPrimary !== updatedSchool.brandPrimary || savedSchool.brandAccent !== updatedSchool.brandAccent) throw new Error("School preferences or tenant branding did not persist.");
  const settingsHtml = await (await fetch(`${base}/app/${schoolSlug}/configuracoes`, { headers: { cookie: adminCookie } })).text();
  if (!settingsHtml.includes(schoolName) || !settingsHtml.includes(displayTeam) || !settingsHtml.includes("--tenant-primary:#1967C0")) throw new Error("Settings screen did not render saved school preferences and tenant theme.");
  const [ownBrandedPage, otherBrandedPage] = await Promise.all([fetch(`${base}/s/${schoolSlug}`), fetch(`${base}/s/${tenantBSlug}`)]);
  const [ownBrandedHtml, otherBrandedHtml] = await Promise.all([ownBrandedPage.text(), otherBrandedPage.text()]);
  if (!ownBrandedHtml.includes("--tenant-primary:#1967C0") || !ownBrandedHtml.includes("--tenant-accent:#F5A623") || otherBrandedHtml.includes("--tenant-primary:#1967C0") || otherBrandedHtml.includes("--tenant-accent:#F5A623")) throw new Error("Tenant branding was not applied exclusively to the requested school's theme.");
  const invalidBranding = await postForm(base, schoolSlug, "configuracoes", adminCookie, { ...updatedSchool, brandPrimary: "red; background:url(javascript:alert(1))" });
  if (invalidBranding.status !== 303) throw new Error("Arbitrary CSS was accepted as a tenant brand color.");
  const afterInvalidBranding = await prisma.school.findUniqueOrThrow({ where: { tenantId: tenant.id }, select: { brandPrimary: true } });
  if (afterInvalidBranding.brandPrimary !== updatedSchool.brandPrimary) throw new Error("Rejected CSS input changed persisted tenant branding.");
  const teacherSettings = await postForm(base, schoolSlug, "configuracoes", teacherCookie, updatedSchool);
  if (teacherSettings.status !== 403) throw new Error(`Teacher unexpectedly changed school settings (${teacherSettings.status}).`);

  const pendingHostname = normalizeDomainName(`school-${suffix}.example.net`);
  tenantDomainHostnames.push(pendingHostname);
  const domainStart = await postForm(base, schoolSlug, "dominios", adminCookie, { action: "start", hostname: pendingHostname });
  if (domainStart.status !== 303 || new URL(domainStart.headers.get("location")!).searchParams.get("domain") !== "pending") throw new Error("School administrator could not start custom domain verification.");
  const pendingDomain = await prisma.tenantDomain.findUniqueOrThrow({ where: { hostname: pendingHostname }, select: { id: true, tenantId: true, status: true, verificationToken: true } });
  if (pendingDomain.tenantId !== tenant.id || pendingDomain.status !== "PENDING") throw new Error("Custom domain registration was not tenant-scoped and pending proof.");
  let malformedDomainRejected = false;
  try { normalizeDomainName("https://first-school.example.net/path"); } catch { malformedDomainRejected = true; }
  const expectedTxt = `turminha-domain-verification=${"a".repeat(48)}`;
  const matchingProof = await verifyDomainTxt(pendingHostname, "a".repeat(48), async () => [[expectedTxt]]);
  const wrongProof = await verifyDomainTxt(pendingHostname, "a".repeat(48), async () => [["turminha-domain-verification=wrong"]]);
  if (!malformedDomainRejected || !matchingProof || wrongProof) throw new Error("Domain normalization or DNS TXT ownership proof validation failed.");

  const verifiedHostname = normalizeDomainName(`verified-${suffix}.example.net`);
  tenantDomainHostnames.push(verifiedHostname);
  const verifiedDomain = await prisma.tenantDomain.create({ data: { tenantId: tenant.id, hostname: verifiedHostname, verificationToken: randomBytes(24).toString("hex"), status: "VERIFIED", verifiedAt: new Date() }, select: { id: true } });
  if ((await resolveVerifiedDomain(verifiedHostname))?.slug !== schoolSlug) throw new Error("Verified custom hostname did not resolve to its exact tenant.");
  const customRoot = await requestWithHost(base, "/", verifiedHostname);
  const customRootLocation = customRoot.headers.location?.toString();
  const customRootPath = customRootLocation ? new URL(customRootLocation, base).pathname : null;
  if (customRoot.status !== 307 || customRootPath !== `/s/${schoolSlug}`) throw new Error(`Verified custom host did not route to its assigned school (${customRoot.status}, ${customRootLocation}).`);
  const unknownHost = `unknown-${suffix}.example.net`;
  const unknownRoot = await requestWithHost(base, "/", unknownHost);
  if (unknownRoot.status !== 404) throw new Error(`Unknown host did not fail closed (${unknownRoot.status}).`);
  const customHostWrongSchool = await requestWithHost(base, `/s/${tenantBSlug}`, verifiedHostname);
  if (customHostWrongSchool.status !== 404) throw new Error(`Verified host exposed a different school's public page (${customHostWrongSchool.status}).`);
  const hostMismatchApi = await requestWithHost(base, `/api/app/${tenantBSlug}/configuracoes`, verifiedHostname, { method: "POST", origin: base, cookie: adminCookie, body: "" });
  if (hostMismatchApi.status !== 404) throw new Error(`Verified host changed API tenant scope (${hostMismatchApi.status}).`);

  const crossTenantClass = await postForm(base, tenantBSlug, "gestao-escolar", adminCookie, { action: "classroom:create", name: `Foreign ${suffix}`, schoolYear: String(new Date().getFullYear()), capacity: "2", unitId: "" });
  if (crossTenantClass.status !== 403) throw new Error("School administrator created a class in another tenant.");
  const bulkFixtures = [
    { assetId: `bulkasset-${randomBytes(7).toString("hex")}`, submissionId: `bulksub-${randomBytes(7).toString("hex")}`, studentId: familyStudentId!, membershipId: familyMembershipId!, title: `Lote da familia um ${suffix}` },
    { assetId: `bulkasset-${randomBytes(7).toString("hex")}`, submissionId: `bulksub-${randomBytes(7).toString("hex")}`, studentId: familyStudentId!, membershipId: familyMembershipId!, title: `Lote da familia dois ${suffix}` },
  ];
  bulkReviewAssetIds.push(...bulkFixtures.map((fixture) => fixture.assetId));
  bulkReviewSubmissionIds.push(...bulkFixtures.map((fixture) => fixture.submissionId));
  await prisma.mediaAsset.createMany({ data: bulkFixtures.map((fixture) => ({ id: fixture.assetId, tenantId: tenant.id, studentId: fixture.studentId, uploadedByMembershipId: fixture.membershipId, title: fixture.title, category: "ACTIVITY" as const, storageKey: `${tenant.id}/${fixture.assetId}`, contentType: "image/webp", scanStatus: "CLEAN", status: "PRIVATE" })) });
  await prisma.mediaConsent.createMany({ data: bulkFixtures.flatMap((fixture) => ["PRIVATE_STORAGE", "SCHOOL_REVIEW"].map((purpose) => ({ tenantId: tenant.id, mediaAssetId: fixture.assetId, membershipId: fixture.membershipId, purpose: purpose as "PRIVATE_STORAGE" | "SCHOOL_REVIEW" }))) });
  await prisma.mediaSubmission.createMany({ data: bulkFixtures.map((fixture) => ({ id: fixture.submissionId, tenantId: tenant.id, mediaAssetId: fixture.assetId, studentId: fixture.studentId, submittedByMembershipId: fixture.membershipId, status: "SUBMITTED" as const })) });
  const bulkQueueHtml = await (await fetch(`${base}/app/${schoolSlug}/midias?status=OPEN`, { headers: { cookie: teacherCookie } })).text();
  if (!bulkQueueHtml.includes("bulk-media-review-form") || !bulkQueueHtml.includes("Aprovar selecionados para uso escolar") || bulkFixtures.some((fixture) => !bulkQueueHtml.includes(fixture.title))) throw new Error("Review queue did not render bulk approval controls for its authorized submissions.");
  const bulkResponse = await postBulkApproval(base, schoolSlug, teacherCookie, [...bulkReviewSubmissionIds, "missing-bulk-submission"]);
  const bulkPayload = await bulkResponse.json() as { results: { id: string; ok: boolean; reason?: string }[] };
  const bulkSubmissions = await prisma.mediaSubmission.findMany({ where: { tenantId: tenant.id, id: { in: bulkReviewSubmissionIds } }, select: { id: true, status: true } });
  const bulkEventCount = await prisma.mediaReviewEvent.count({ where: { tenantId: tenant.id, submissionId: { in: bulkReviewSubmissionIds }, toStatus: "APPROVED" } });
  const bulkPublicationCount = await prisma.mediaPublication.count({ where: { tenantId: tenant.id, mediaAssetId: { in: bulkReviewAssetIds } } });
  if (bulkResponse.status !== 200 || bulkPayload.results.length !== 3 || bulkPayload.results.filter((result) => result.ok).length !== 2 || bulkPayload.results.find((result) => result.id === "missing-bulk-submission")?.ok !== false || bulkSubmissions.some((item) => item.status !== "APPROVED") || bulkEventCount !== 2 || bulkPublicationCount !== 0) throw new Error(`Bulk approval did not preserve independent per-item decisions without auto-publishing (HTTP ${bulkResponse.status}, results ${JSON.stringify(bulkPayload.results)}, states ${JSON.stringify(bulkSubmissions)}, events ${bulkEventCount}, publications ${bulkPublicationCount}).`);
  const familyBulkDenied = await postBulkApproval(base, schoolSlug, familyCookie, bulkReviewSubmissionIds);
  if (familyBulkDenied.status !== 403) throw new Error("Family membership could access the school bulk review action.");
  publicationStudentGuardianId = (await prisma.studentGuardian.create({ data: { tenantId: tenant.id, studentId: secondFamilyStudentId!, membershipId: familyMembershipId!, approved: true } })).id;
  publicationSecondGuardianId = secondFamilyStudentGuardianId;
  await prisma.studentGuardian.updateMany({ where: { tenantId: tenant.id, id: publicationSecondGuardianId, approved: true }, data: { revokedAt: null } });
  publicationAssetId = `publication-${randomBytes(7).toString("hex")}`;
  const publicationTitle = `Portfólio smoke ${suffix}`;
  const publicationBytes = Buffer.from("private child portfolio publication smoke");
  publicationStorageKey = await storePrivateObjectLocally({ key: `${tenant.id}/${publicationAssetId}`, bytes: publicationBytes });
  await prisma.mediaAsset.create({ data: { id: publicationAssetId, tenantId: tenant.id, studentId: secondFamilyStudentId!, uploadedByMembershipId: secondFamilyMembershipId!, title: publicationTitle, category: "ACTIVITY", storageKey: publicationStorageKey, originalFilename: "portfolio-smoke.webp", contentType: "image/webp", byteSize: publicationBytes.length, checksumSha256: createHash("sha256").update(publicationBytes).digest("hex"), scanStatus: "CLEAN", status: "PRIVATE" } });
  await prisma.mediaConsent.createMany({ data: [{ tenantId: tenant.id, mediaAssetId: publicationAssetId, membershipId: secondFamilyMembershipId!, purpose: "PRIVATE_STORAGE" }, { tenantId: tenant.id, mediaAssetId: publicationAssetId, membershipId: secondFamilyMembershipId!, purpose: "SCHOOL_REVIEW" }] });
  publicationSubmissionId = `submission-${randomBytes(7).toString("hex")}`;
  await prisma.mediaSubmission.create({ data: { id: publicationSubmissionId, tenantId: tenant.id, mediaAssetId: publicationAssetId, studentId: secondFamilyStudentId!, submittedByMembershipId: secondFamilyMembershipId!, status: "APPROVED" } });
  await prisma.mediaReviewEvent.create({ data: { tenantId: tenant.id, submissionId: publicationSubmissionId, actorMembershipId: adminMembershipId!, actorDisplayName: "Smoke admin", actorRole: "SCHOOL_ADMIN", fromStatus: "SUBMITTED", toStatus: "APPROVED" } });
  const requestPublication = await postForm(base, schoolSlug, `midias/publications/${publicationSubmissionId}`, adminCookie, {});
  if (requestPublication.status !== 303) throw new Error(`Editorial publication request failed (${requestPublication.status}).`);
  const publication = await prisma.mediaPublication.findFirstOrThrow({ where: { tenantId: tenant.id, mediaAssetId: publicationAssetId }, select: { id: true, status: true } });
  const familyPortfolioPending = await (await fetch(`${base}/familia/${schoolSlug}`, { headers: { cookie: familyCookie } })).text();
  if (publication.status !== "AWAITING_CONSENT" || !familyPortfolioPending.includes(publicationTitle)) throw new Error("Publication request was not held for guardian consent or rendered to the linked family.");
  const firstPublicationGrants = await Promise.all([
    postFamilyForm(base, schoolSlug, `publicacoes/${publication.id}`, familyCookie, { action: "grant" }),
    postFamilyForm(base, schoolSlug, `publicacoes/${publication.id}`, familyCookie, { action: "grant" }),
  ]);
  if (firstPublicationGrants.some((response) => response.status !== 303)) throw new Error("Concurrent duplicate guardian grants did not complete idempotently.");
  const blockedPartialPortfolio = await fetch(`${base}/api/app/${schoolSlug}/midias/${publicationAssetId}`, { headers: { cookie: familyCookie } });
  const partialPublicationStatus = await prisma.mediaPublication.findUniqueOrThrow({
    where: { tenantId_id: { tenantId: tenant.id, id: publication.id } },
    select: {
      status: true,
      consents: { select: { membershipId: true, grantedAt: true } },
      student: { select: { guardians: { where: { approved: true, revokedAt: null, membership: { role: "GUARDIAN", status: "ACTIVE" } }, select: { membershipId: true } } } },
    },
  });
  const partialGrantEvents = await prisma.mediaPublicationEvent.count({ where: { tenantId: tenant.id, publicationId: publication.id, action: "CONSENT_GRANTED", actorMembershipId: familyMembershipId } });
  if (blockedPartialPortfolio.status !== 404 || partialPublicationStatus.status !== "AWAITING_CONSENT" || partialGrantEvents !== 1) throw new Error(`Partial or duplicate concurrent guardian grants changed authorization incorrectly (HTTP ${blockedPartialPortfolio.status}, state ${partialPublicationStatus.status}, grant events ${partialGrantEvents}, guardians ${JSON.stringify(partialPublicationStatus.student.guardians)}).`);
  const secondPublicationGrant = await postFamilyForm(base, schoolSlug, `publicacoes/${publication.id}`, secondFamilyCookie, { action: "grant" });
  if (secondPublicationGrant.status !== 303) throw new Error("Second active guardian could not grant publication consent.");
  const publishedState = await prisma.mediaPublication.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenant.id, id: publication.id } }, select: { status: true } });
  const [guardianOnePortfolio, guardianTwoPortfolio] = await Promise.all([
    fetch(`${base}/api/app/${schoolSlug}/midias/${publicationAssetId}`, { headers: { cookie: familyCookie } }),
    fetch(`${base}/api/app/${schoolSlug}/midias/${publicationAssetId}`, { headers: { cookie: secondFamilyCookie } }),
  ]);
  if (publishedState.status !== "PUBLISHED" || guardianOnePortfolio.status !== 200 || guardianTwoPortfolio.status !== 200) throw new Error("Portfolio did not become available to both guardians after all consents.");
  const familyPasswordHash = await prisma.user.findUniqueOrThrow({ where: { email: signinEmails[2]! }, select: { passwordHash: true } });
  const lateGuardian = await prisma.user.create({ data: { email: `late-guardian-${suffix}@turminha.local`, displayName: `Responsável novo ${suffix}`, passwordHash: familyPasswordHash.passwordHash } });
  lateGuardianUserId = lateGuardian.id;
  lateGuardianMembershipId = (await prisma.membership.create({ data: { tenantId: tenant.id, userId: lateGuardian.id, role: "GUARDIAN", status: "ACTIVE" } })).id;
  lateGuardianLinkId = (await prisma.studentGuardian.create({ data: { tenantId: tenant.id, studentId: secondFamilyStudentId!, membershipId: lateGuardianMembershipId, approved: true } })).id;
  const afterGuardianAdded = await fetch(`${base}/api/app/${schoolSlug}/midias/${publicationAssetId}`, { headers: { cookie: familyCookie } });
  if (afterGuardianAdded.status !== 404) throw new Error("Adding a new active guardian did not revoke reads until that guardian had an explicit publication consent.");
  await prisma.studentGuardian.updateMany({ where: { tenantId: tenant.id, id: lateGuardianLinkId }, data: { revokedAt: new Date() } });
  const afterGuardianLinkRevoked = await fetch(`${base}/api/app/${schoolSlug}/midias/${publicationAssetId}`, { headers: { cookie: familyCookie } });
  if (afterGuardianLinkRevoked.status !== 200) throw new Error("Revoking a newly added guardian link left authorized portfolio access blocked.");
  const familyMembershipBefore = await prisma.membership.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenant.id, id: familyMembershipId! } }, select: { role: true, status: true } });
  await prisma.membership.update({ where: { tenantId_id: { tenantId: tenant.id, id: familyMembershipId! } }, data: { status: "REVOKED" } });
  const afterMembershipRevoked = await fetch(`${base}/api/app/${schoolSlug}/midias/${publicationAssetId}`, { headers: { cookie: familyCookie } });
  await prisma.membership.update({ where: { tenantId_id: { tenantId: tenant.id, id: familyMembershipId! } }, data: familyMembershipBefore });
  const afterMembershipRestored = await fetch(`${base}/api/app/${schoolSlug}/midias/${publicationAssetId}`, { headers: { cookie: familyCookie } });
  if (afterMembershipRevoked.status !== 403 || afterMembershipRestored.status !== 200) throw new Error("Family asset access did not follow the current membership status.");
  const crossTenantPublicationRead = await fetch(`${base}/api/app/${tenantBSlug}/midias/${publicationAssetId}`, { headers: { cookie: familyCookie } });
  const crossTenantConsent = await postFamilyForm(base, tenantBSlug, `publicacoes/${publication.id}`, familyCookie, { action: "revoke" });
  if (crossTenantPublicationRead.status !== 403 || crossTenantConsent.status !== 403) throw new Error("Editorial publication route accepted a cross-tenant family session.");
  const withdrawPublicationConsent = await postFamilyForm(base, schoolSlug, `publicacoes/${publication.id}`, familyCookie, { action: "revoke" });
  const blockedAfterPublicationWithdrawal = await fetch(`${base}/api/app/${schoolSlug}/midias/${publicationAssetId}`, { headers: { cookie: familyCookie } });
  const publicationHistory = await prisma.mediaPublicationEvent.findMany({ where: { tenantId: tenant.id, publicationId: publication.id }, select: { action: true }, orderBy: { createdAt: "asc" } });
  if (withdrawPublicationConsent.status !== 303 || blockedAfterPublicationWithdrawal.status !== 404 || (await prisma.mediaPublication.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenant.id, id: publication.id } }, select: { status: true } })).status !== "WITHDRAWN" || !publicationHistory.some((event) => event.action === "PUBLICATION_REQUESTED") || !publicationHistory.some((event) => event.action === "PUBLISHED_AFTER_ALL_CONSENTS") || !publicationHistory.some((event) => event.action === "CONSENT_REVOKED")) throw new Error("Publication withdrawal did not revoke all future reads or preserve the editorial audit trail.");
  const concurrentPublicationId = `pubrace-${randomBytes(7).toString("hex")}`;
  publicationFixtureIds.push(concurrentPublicationId);
  await prisma.mediaPublication.create({ data: { id: concurrentPublicationId, tenantId: tenant.id, mediaAssetId: publicationAssetId, studentId: secondFamilyStudentId!, requestedByMembershipId: adminMembershipId!, status: "AWAITING_CONSENT" } });
  await prisma.mediaPublicationConsent.createMany({ data: [familyMembershipId, secondFamilyMembershipId].map((membershipId) => ({ tenantId: tenant.id, publicationId: concurrentPublicationId, membershipId: membershipId! })) });
  const [distinctGuardianGrantOne, distinctGuardianGrantTwo] = await Promise.all([
    postFamilyForm(base, schoolSlug, `publicacoes/${concurrentPublicationId}`, familyCookie, { action: "grant" }),
    postFamilyForm(base, schoolSlug, `publicacoes/${concurrentPublicationId}`, secondFamilyCookie, { action: "grant" }),
  ]);
  const concurrentlyPublished = await prisma.mediaPublication.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenant.id, id: concurrentPublicationId } }, select: { status: true } });
  const concurrentGrantEvents = await prisma.mediaPublicationEvent.count({ where: { tenantId: tenant.id, publicationId: concurrentPublicationId, action: "CONSENT_GRANTED" } });
  const concurrentPublishEvents = await prisma.mediaPublicationEvent.count({ where: { tenantId: tenant.id, publicationId: concurrentPublicationId, action: "PUBLISHED_AFTER_ALL_CONSENTS" } });
  if ([distinctGuardianGrantOne.status, distinctGuardianGrantTwo.status].some((status) => status !== 303) || concurrentlyPublished.status !== "PUBLISHED" || concurrentGrantEvents !== 2 || concurrentPublishEvents !== 1) throw new Error(`Concurrent distinct-guardian grants failed (HTTP ${distinctGuardianGrantOne.status}/${distinctGuardianGrantTwo.status}, state ${concurrentlyPublished.status}, grants ${concurrentGrantEvents}, publish events ${concurrentPublishEvents}).`);
  const raceLink = await prisma.studentGuardian.findFirstOrThrow({ where: { tenantId: tenant.id, studentId: secondFamilyStudentId!, membershipId: familyMembershipId!, approved: true, revokedAt: null }, select: { id: true } });
  const [downloadRacingEditorialLinkRevocation, editorialLinkRevocation] = await Promise.all([
    fetch(`${base}/api/app/${schoolSlug}/midias/${publicationAssetId}`, { headers: { cookie: familyCookie } }),
    prisma.studentGuardian.updateMany({ where: { tenantId: tenant.id, id: raceLink.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  if (editorialLinkRevocation.count !== 1 || ![200, 404].includes(downloadRacingEditorialLinkRevocation.status)) throw new Error(`Editorial download/link-revocation race produced an invalid result (${downloadRacingEditorialLinkRevocation.status}, changed ${editorialLinkRevocation.count}).`);
  const downloadAfterEditorialLinkRevocation = await fetch(`${base}/api/app/${schoolSlug}/midias/${publicationAssetId}`, { headers: { cookie: familyCookie } });
  await prisma.studentGuardian.updateMany({ where: { tenantId: tenant.id, id: raceLink.id }, data: { revokedAt: null } });
  if (downloadAfterEditorialLinkRevocation.status !== 404) throw new Error("Revoking a guardian link did not block subsequent editorial downloads.");
  const withdrawConcurrentPublication = await postFamilyForm(base, schoolSlug, `publicacoes/${concurrentPublicationId}`, secondFamilyCookie, { action: "revoke" });
  if (withdrawConcurrentPublication.status !== 303) throw new Error("Could not withdraw the concurrent-grant publication fixture.");
  const publicationFixtures = Array.from({ length: 26 }, (_, index) => ({
    assetId: `pubfixture-${randomBytes(8).toString("hex")}`,
    publicationId: `pubrow-${randomBytes(8).toString("hex")}`,
    title: `Portfólio página ${index}`,
    createdAt: new Date(Date.now() - 100_000 + index * 1000),
  }));
  publicationFixtureAssetIds.push(...publicationFixtures.map((item) => item.assetId));
  publicationFixtureIds.push(...publicationFixtures.map((item) => item.publicationId));
  await prisma.mediaAsset.createMany({ data: publicationFixtures.map((item) => ({ id: item.assetId, tenantId: tenant.id, studentId: secondFamilyStudentId!, uploadedByMembershipId: secondFamilyMembershipId!, title: item.title, category: "ACTIVITY", storageKey: `${tenant.id}/${item.assetId}`, contentType: "image/webp", scanStatus: "CLEAN", status: "PRIVATE" })) });
  await prisma.mediaPublication.createMany({ data: publicationFixtures.map((item) => ({ id: item.publicationId, tenantId: tenant.id, mediaAssetId: item.assetId, studentId: secondFamilyStudentId!, requestedByMembershipId: adminMembershipId!, status: "PUBLISHED", createdAt: item.createdAt, publishedAt: item.createdAt })) });
  await prisma.mediaPublicationConsent.createMany({ data: publicationFixtures.flatMap((item) => [familyMembershipId, secondFamilyMembershipId].map((membershipId) => ({ tenantId: tenant.id, publicationId: item.publicationId, membershipId: membershipId!, grantedAt: item.createdAt }))) });
  const publicationListOneHtml = await (await fetch(`${base}/familia/${schoolSlug}`, { headers: { cookie: familyCookie } })).text();
  const publicationPageTwoHref = publicationListOneHtml.match(/href="([^"]*publicationPage=2[^"]*)"/)?.[1]?.replaceAll("&amp;", "&");
  if (!publicationPageTwoHref) throw new Error("Family portfolio did not render server pagination for 26 published entries.");
  const publicationPageTwoUrl = new URL(publicationPageTwoHref, base);
  if (publicationPageTwoUrl.searchParams.get("publicationPage") !== "2") throw new Error("Portfolio pagination link did not preserve the selected page.");
  const publicationListTwoHtml = await (await fetch(publicationPageTwoUrl, { headers: { cookie: familyCookie } })).text();
  if (!publicationListTwoHtml.includes(publicationFixtures[13]!.title)) throw new Error("Portfolio page two did not return the correct server slice.");
  const clampedPublicationUrl = new URL(publicationPageTwoUrl);
  clampedPublicationUrl.searchParams.set("publicationPage", "999");
  const clampedPublicationHtml = await (await fetch(clampedPublicationUrl, { headers: { cookie: familyCookie } })).text();
  if (!clampedPublicationHtml.includes(publicationFixtures[0]!.title)) throw new Error("Out-of-range portfolio page was not clamped to the last server page.");
  const muralUrl = `${base}/api/familia/${schoolSlug}/mural-editorial?studentId=${encodeURIComponent(secondFamilyStudentId!)}`;
  const muralPageOneResponse = await fetch(muralUrl, { headers: { cookie: familyCookie } });
  const muralPageOne = await muralPageOneResponse.json() as { items: { publicationId: string; assetId: string; title: string }[]; nextCursor: string | null; hasMore: boolean };
  if (muralPageOneResponse.status !== 200 || muralPageOne.items.length !== 12 || !muralPageOne.hasMore || !muralPageOne.nextCursor || muralPageOne.items[0]?.publicationId !== publicationFixtures[25]!.publicationId) throw new Error("Editorial mural did not return its first server-paged 12 items in stable order.");
  const familyMuralHtml = await (await fetch(`${base}/familia/${schoolSlug}?muralStudentId=${encodeURIComponent(secondFamilyStudentId!)}`, { headers: { cookie: familyCookie } })).text();
  if (!familyMuralHtml.includes("Carregar mais lembranças") || !familyMuralHtml.includes(publicationFixtures[25]!.title)) throw new Error("Family portal did not render the editorial mural and its next-page action.");
  const tamperedCursor = `${muralPageOne.nextCursor.slice(0, -1)}${muralPageOne.nextCursor.endsWith("A") ? "B" : "A"}`;
  const tamperedMuralResponse = await fetch(`${muralUrl}&cursor=${encodeURIComponent(tamperedCursor)}`, { headers: { cookie: familyCookie } });
  const otherMembershipMuralResponse = await fetch(`${base}/api/familia/${schoolSlug}/mural-editorial?studentId=${encodeURIComponent(secondFamilyStudentId!)}&cursor=${encodeURIComponent(muralPageOne.nextCursor)}`, { headers: { cookie: secondFamilyCookie } });
  const otherFilterMuralResponse = await fetch(`${base}/api/familia/${schoolSlug}/mural-editorial?studentId=${encodeURIComponent(familyStudentId!)}&cursor=${encodeURIComponent(muralPageOne.nextCursor)}`, { headers: { cookie: familyCookie } });
  const unlinkedStudentMural = await (await prisma.student.findFirstOrThrow({ where: { tenantId: tenantB.id }, select: { id: true } }).then(({ id }) => fetch(`${base}/api/familia/${schoolSlug}/mural-editorial?studentId=${encodeURIComponent(id)}`, { headers: { cookie: familyCookie } }))).json() as { items: unknown[]; invalidFilter: boolean };
  if (tamperedMuralResponse.status !== 400 || otherMembershipMuralResponse.status !== 400 || otherFilterMuralResponse.status !== 400 || unlinkedStudentMural.items.length !== 0 || !unlinkedStudentMural.invalidFilter) throw new Error(`Editorial mural cursor/filter guard failed: tampered=${tamperedMuralResponse.status}, membership=${otherMembershipMuralResponse.status}, filter=${otherFilterMuralResponse.status}, unlinked=${JSON.stringify(unlinkedStudentMural)}.`);
  await postFamilyForm(base, schoolSlug, `publicacoes/${publicationFixtures[12]!.publicationId}`, familyCookie, { action: "revoke" });
  const concurrentPublication = { assetId: `muralnew-${randomBytes(7).toString("hex")}`, publicationId: `muralrow-${randomBytes(7).toString("hex")}`, title: `Publicação após snapshot ${suffix}`, createdAt: new Date(Date.now() + 10_000) };
  publicationFixtureAssetIds.push(concurrentPublication.assetId);
  publicationFixtureIds.push(concurrentPublication.publicationId);
  await prisma.mediaAsset.create({ data: { id: concurrentPublication.assetId, tenantId: tenant.id, studentId: secondFamilyStudentId!, uploadedByMembershipId: secondFamilyMembershipId!, title: concurrentPublication.title, category: "ACTIVITY", storageKey: `${tenant.id}/${concurrentPublication.assetId}`, contentType: "image/webp", scanStatus: "CLEAN", status: "PRIVATE" } });
  await prisma.mediaPublication.create({ data: { id: concurrentPublication.publicationId, tenantId: tenant.id, mediaAssetId: concurrentPublication.assetId, studentId: secondFamilyStudentId!, requestedByMembershipId: adminMembershipId!, status: "PUBLISHED", createdAt: concurrentPublication.createdAt, publishedAt: concurrentPublication.createdAt } });
  await prisma.mediaPublicationConsent.createMany({ data: [familyMembershipId, secondFamilyMembershipId].map((membershipId) => ({ tenantId: tenant.id, publicationId: concurrentPublication.publicationId, membershipId: membershipId!, grantedAt: concurrentPublication.createdAt })) });
  const muralPageTwoResponse = await fetch(`${muralUrl}&cursor=${encodeURIComponent(muralPageOne.nextCursor)}`, { headers: { cookie: familyCookie } });
  const muralPageTwo = await muralPageTwoResponse.json() as { items: { publicationId: string; title: string }[]; nextCursor: string | null; hasMore: boolean };
  if (muralPageTwoResponse.status !== 200 || muralPageTwo.items.length !== 12 || muralPageTwo.items.some((item) => item.publicationId === publicationFixtures[12]!.publicationId || item.publicationId === concurrentPublication.publicationId) || new Set([...muralPageOne.items.map((item) => item.publicationId), ...muralPageTwo.items.map((item) => item.publicationId)]).size !== 24) throw new Error("Mural page two included revoked/new items or duplicated entries while navigating a snapshot.");
  if (!muralPageTwo.nextCursor || !muralPageTwo.hasMore) throw new Error("Editorial mural did not retain the final page after filtering a revoked entry.");
  const muralPageThree = await (await fetch(`${muralUrl}&cursor=${encodeURIComponent(muralPageTwo.nextCursor)}`, { headers: { cookie: familyCookie } })).json() as { items: { publicationId: string }[]; nextCursor: string | null; hasMore: boolean };
  const allMuralIds = [...muralPageOne.items.map((item) => item.publicationId), ...muralPageTwo.items.map((item) => item.publicationId), ...muralPageThree.items.map((item) => item.publicationId)];
  if (muralPageThree.items.length !== 1 || muralPageThree.items[0]?.publicationId !== publicationFixtures[0]!.publicationId || muralPageThree.hasMore || muralPageThree.nextCursor || allMuralIds.length !== 25 || new Set(allMuralIds).size !== allMuralIds.length) throw new Error("Editorial mural did not exhaust the frozen feed without duplicates after a between-page revocation.");
  console.log(JSON.stringify({ classroom: "created and rendered from shared MariaDB under tenant scope", diary: "persisted execution linked to approved plan; identical retry created one row; divergent retry rejected; absent participant rejected", pedagogy: "draft/submission/review plus server-paginated diary timeline; page two preserved filters; page 999 clamped; date/student/plan filters and cross-tenant classroom rejection passed", bulkMediaReview: "selected authorized submissions approved independently; one unavailable ID reported as a partial failure; two audit events written; family role denied; approval created no publication", familyEvidenceConsent: "two children and households; concurrent grants remained unique; 14 authorized entries paged 12+1 after revoking an item between pages; revoked item omitted; school closure and guardian-link revocation blocked access; reopening required fresh consent; immutable history retained", editorialPublication: "approved submission requested; duplicate and distinct-guardian concurrent grants idempotent; exactly two grants published once; active guardians required; new active guardian and revoked membership blocked reads; link revocation race allowed only in-flight 200/404 and blocked subsequent download; cross-tenant reads/consent denied; withdrawal blocked subsequent reads; append-only audit events retained", editorialMural: "server cursor HMAC-bound to tenant, membership and child filter; tampered/foreign cursors denied; 26 items paged 12+12+1; revoked item omitted between pages; newly published item excluded from the active snapshot; no duplicate IDs", settings: "validated tenant color settings persisted and rendered only in the matching school's admin/public theme; malformed CSS rejected without changing persisted branding; teacher write denied", domains: "TXT proof matched/mismatched with injected test records; pending domain scoped to school; verified host resolved to its exact tenant; unknown host, cross-school public path and API host/tenant mismatch failed closed", crossTenant: "admin class creation and family/team/media publication routes in another school denied" }));
} finally {
  stopChild(webProcess);
  await delay(500);
  if (webProcess && webProcess.exitCode === null) await Promise.race([new Promise<void>((resolve) => webProcess!.once("exit", () => resolve())), delay(5000)]);
  const workspaceRoot = path.resolve(process.cwd());
  const distDir = path.resolve(process.cwd(), `.next-smoke-m3-workflows-${suffix}`);
  if (distDir.startsWith(`${workspaceRoot}${path.sep}`)) await rm(distDir, { recursive: true, force: true });
  if (tenantId) {
    if (tenantDomainHostnames.length) await prisma.tenantDomain.deleteMany({ where: { tenantId, hostname: { in: tenantDomainHostnames } } });
    if (dashboardCalendarEntryId) await prisma.calendarEntry.deleteMany({ where: { tenantId, id: dashboardCalendarEntryId } });
    if (dashboardSchoolYearCreated && dashboardSchoolYearId) await prisma.schoolYear.deleteMany({ where: { tenantId, id: dashboardSchoolYearId } });
    if (dashboardMediaSubmissionId) await prisma.mediaSubmission.deleteMany({ where: { tenantId, id: dashboardMediaSubmissionId } });
    if (dashboardMediaAssetIds.length) {
      await prisma.mediaConsent.deleteMany({ where: { tenantId, mediaAssetId: { in: dashboardMediaAssetIds } } });
      await prisma.mediaAsset.deleteMany({ where: { tenantId, id: { in: dashboardMediaAssetIds } } });
    }
    if (bulkReviewSubmissionIds.length) await prisma.mediaReviewEvent.deleteMany({ where: { tenantId, submissionId: { in: bulkReviewSubmissionIds } } });
    if (bulkReviewSubmissionIds.length) await prisma.mediaSubmission.deleteMany({ where: { tenantId, id: { in: bulkReviewSubmissionIds } } });
    if (bulkReviewAssetIds.length) {
      await prisma.mediaConsent.deleteMany({ where: { tenantId, mediaAssetId: { in: bulkReviewAssetIds } } });
      await prisma.mediaAsset.deleteMany({ where: { tenantId, id: { in: bulkReviewAssetIds } } });
    }
    if (classroomId) {
      const entries = await prisma.journalEntry.findMany({ where: { tenantId, classroomId, title: { startsWith: journalTitle } }, select: { id: true } });
      const entryIds = entries.map((item) => item.id);
      if (entryIds.length) {
        const evidenceRows = await prisma.journalEvidence.findMany({ where: { tenantId, journalEntryId: { in: entryIds } }, select: { id: true } });
        const cleanupEvidenceIds = evidenceRows.map((item) => item.id);
        const shares = await prisma.journalEvidenceFamilyShare.findMany({ where: { tenantId, journalEvidenceId: { in: cleanupEvidenceIds } }, select: { id: true } });
        await prisma.journalEvidenceFamilyConsent.deleteMany({ where: { tenantId, shareId: { in: shares.map((item) => item.id) } } });
        await prisma.journalEvidenceFamilyShare.deleteMany({ where: { tenantId, journalEvidenceId: { in: cleanupEvidenceIds } } });
        await prisma.journalEvidence.deleteMany({ where: { tenantId, id: { in: cleanupEvidenceIds } } });
        if (evidenceStorageKey?.startsWith("local/")) {
          const storageRoot = path.resolve(process.env.PRIVATE_STORAGE_LOCAL_DIR ?? "./var/private-storage");
          const objectPath = path.resolve(storageRoot, evidenceStorageKey);
          if (objectPath.startsWith(`${storageRoot}${path.sep}`)) await rm(objectPath, { force: true });
        }
      }
      if (entryIds.length) {
        await prisma.journalParticipant.deleteMany({ where: { tenantId, journalEntryId: { in: entryIds } } });
        await prisma.journalEntry.deleteMany({ where: { tenantId, id: { in: entryIds } } });
      }
      const plans = await prisma.learningPlan.findMany({ where: { tenantId, classroomId, title: planTitle }, select: { id: true } });
      await prisma.learningPlan.deleteMany({ where: { tenantId, id: { in: plans.map((item) => item.id) } } });
      if (publicationFixtureIds.length) {
        await prisma.mediaPublicationEvent.deleteMany({ where: { tenantId, publicationId: { in: publicationFixtureIds } } });
        await prisma.mediaPublicationConsent.deleteMany({ where: { tenantId, publicationId: { in: publicationFixtureIds } } });
        await prisma.mediaPublication.deleteMany({ where: { tenantId, id: { in: publicationFixtureIds } } });
        await prisma.mediaAsset.deleteMany({ where: { tenantId, id: { in: publicationFixtureAssetIds } } });
      }
      if (publicationAssetId) {
        const publications = await prisma.mediaPublication.findMany({ where: { tenantId, mediaAssetId: publicationAssetId }, select: { id: true } });
        await prisma.mediaPublicationEvent.deleteMany({ where: { tenantId, publicationId: { in: publications.map((item) => item.id) } } });
        await prisma.mediaPublicationConsent.deleteMany({ where: { tenantId, publicationId: { in: publications.map((item) => item.id) } } });
        await prisma.mediaPublication.deleteMany({ where: { tenantId, id: { in: publications.map((item) => item.id) } } });
        if (publicationSubmissionId) await prisma.mediaReviewEvent.deleteMany({ where: { tenantId, submissionId: publicationSubmissionId } });
        if (publicationSubmissionId) await prisma.mediaSubmission.deleteMany({ where: { tenantId, id: publicationSubmissionId } });
        await prisma.mediaConsent.deleteMany({ where: { tenantId, mediaAssetId: publicationAssetId } });
        await prisma.mediaAsset.deleteMany({ where: { tenantId, id: publicationAssetId } });
        if (publicationStorageKey?.startsWith("local/")) {
          const storageRoot = path.resolve(process.env.PRIVATE_STORAGE_LOCAL_DIR ?? "./var/private-storage");
          const objectPath = path.resolve(storageRoot, publicationStorageKey);
          if (objectPath.startsWith(`${storageRoot}${path.sep}`)) await rm(objectPath, { force: true });
        }
      }
      if (lateGuardianLinkId) await prisma.studentGuardian.deleteMany({ where: { tenantId, id: lateGuardianLinkId } });
      await prisma.attendance.deleteMany({ where: { tenantId, enrollmentId: { in: enrollmentIds } } });
      if (teacherMembershipId) await prisma.classroomStaff.deleteMany({ where: { tenantId, classroomId, membershipId: teacherMembershipId } });
      if (familyMembershipId && familyStudentId) await prisma.studentGuardian.deleteMany({ where: { tenantId, studentId: familyStudentId, membershipId: familyMembershipId } });
      if (publicationStudentGuardianId) await prisma.studentGuardian.deleteMany({ where: { tenantId, id: publicationStudentGuardianId } });
      if (publicationSecondGuardianId) await prisma.studentGuardian.deleteMany({ where: { tenantId, id: publicationSecondGuardianId } });
      if (secondFamilyStudentGuardianId) await prisma.studentGuardian.deleteMany({ where: { tenantId, id: secondFamilyStudentGuardianId } });
      await prisma.enrollment.deleteMany({ where: { tenantId, classroomId } });
      if (studentIds.length) await prisma.student.deleteMany({ where: { tenantId, id: { in: studentIds } } });
      await prisma.classroom.deleteMany({ where: { tenantId, id: classroomId, name: classroomName } });
    }
    if (originalSchool) await prisma.school.update({ where: { tenantId }, data: originalSchool });
  }
  if (sessionTokenHashes.length) await prisma.session.deleteMany({ where: { tokenHash: { in: sessionTokenHashes } } });
  if (secondFamilyMembershipId) await prisma.membership.deleteMany({ where: { tenantId, id: secondFamilyMembershipId } });
  if (secondFamilyUserId) await prisma.user.deleteMany({ where: { id: secondFamilyUserId } });
  if (lateGuardianMembershipId) await prisma.membership.deleteMany({ where: { tenantId, id: lateGuardianMembershipId } });
  if (lateGuardianUserId) await prisma.user.deleteMany({ where: { id: lateGuardianUserId } });
  if (rateKeys.length) {
    await prisma.rateLimitBucket.deleteMany({ where: { keyHash: { in: rateKeys } } });
    for (const bucket of priorRateBuckets) await prisma.rateLimitBucket.create({ data: bucket });
  }
  await prisma.$disconnect();
  const tsconfigPath = path.join(workspaceRoot, "tsconfig.json");
  const rawTsconfig = await readFile(tsconfigPath, "utf8");
  const tsconfig = JSON.parse(rawTsconfig.charCodeAt(0) === 0xfeff ? rawTsconfig.slice(1) : rawTsconfig) as { include?: string[] };
  const temporarySegment = path.basename(distDir);
  tsconfig.include = tsconfig.include?.filter((entry) => !(entry.startsWith("./") ? entry.slice(2) : entry).startsWith(`${temporarySegment}/`));
  await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}${String.fromCharCode(10)}`, "utf8");
}

// The isolated Next/esbuild workers can retain an idle handle after the full cleanup on Windows.
process.exit(0);
