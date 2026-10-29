import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { createServer, type AddressInfo, type Server } from "node:net";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { deletePrivateObject, getPrivateObject } from "../src/server/storage/s3.js";

loadEnvFile(existsSync(".env.local") ? ".env.local" : ".env");
if (process.env.NODE_ENV === "production") throw new Error("Journal evidence smoke is blocked in production.");
const rawUrl = process.env.DATABASE_URL;
const seedPassword = process.env.DEMO_SEED_PASSWORD;
if (!rawUrl || !seedPassword) throw new Error("Local DATABASE_URL and DEMO_SEED_PASSWORD are required.");
const dbUrl = new URL(rawUrl);
const database = decodeURIComponent(dbUrl.pathname.replace(/^\//, ""));
if (dbUrl.protocol !== "mysql:" || !["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) || !/(?:_dev|_test)$/.test(database)) throw new Error("Evidence smoke requires a loopback *_dev or *_test database.");

process.env.PRIVATE_STORAGE_LOCAL_DIR = "private-storage";
const prisma = new PrismaClient({ adapter: new PrismaMariaDb({ host: dbUrl.hostname, port: Number(dbUrl.port || 3306), user: decodeURIComponent(dbUrl.username), password: decodeURIComponent(dbUrl.password), database, connectionLimit: 3 }) });
let clamServer: Server | undefined;
let webProcess: ChildProcess | undefined;
let webOutput = "";
let tenantAId: string | undefined;
let classroomId: string | undefined;
let studentId: string | undefined;
let enrollmentId: string | undefined;
let entryId: string | undefined;
let evidenceId: string | undefined;
let teacherMembershipId: string | undefined;
const sessionTokenHashes: string[] = [];
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const smokeDistDir = `.next-smoke-m3-evidence-${suffix}`;
const classroomName = `Smoke evidência ${suffix}`;
const studentName = `Estudante evidência ${suffix}`;
const uploadFilename = `evidencia-${suffix}.png`;
const rateSecret = process.env.RATE_LIMIT_SECRET ?? "turminha-local-rate-limit-secret-only";
const rateKey = (scope: string, identity: string) => createHmac("sha256", rateSecret).update(`${scope}\0${identity}`).digest("hex");
const signinEmails = ["professora.demo@turminha.local", "familia.pilares.demo@turminha.local"];
const signinKeys = signinEmails.map((email) => rateKey("signin", email));
const priorRateBuckets = await prisma.rateLimitBucket.findMany({ where: { keyHash: { in: signinKeys } } });

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

async function requireApp(url: string) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (!webProcess || webProcess.exitCode !== null) throw new Error(`Temporary Next.js smoke server exited early (${webProcess?.exitCode ?? "unknown"}): ${webOutput}`);
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); if (response.ok) return; } catch {}
    await delay(350);
  }
  throw new Error("Temporary Next.js smoke server did not become ready within 60 seconds.");
}

async function runEvidenceWorker(evidenceOnlyId: string, clamPort: number) {
  const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/drain-storage-outbox.ts", "--evidence-id", evidenceOnlyId], {
    cwd: process.cwd(),
    env: { ...process.env, CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String(clamPort), PRIVATE_STORAGE_LOCAL_DIR: "private-storage" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const result = await new Promise<{ code: number | null; error?: Error }>((resolve) => {
    const timeout = setTimeout(() => { stopChild(child); resolve({ code: null, error: new Error("Evidence worker exceeded 30 seconds.") }); }, 30_000);
    child.once("error", (error) => { clearTimeout(timeout); resolve({ code: null, error }); });
    child.once("close", (code) => { clearTimeout(timeout); resolve({ code }); });
  });
  if (result.error || result.code !== 0) throw new Error(`Targeted evidence worker failed (${result.code ?? result.error}): ${stderr || stdout}`);
  return stdout;
}

async function login(base: string, email: string, tenant: string) {
  const response = await fetch(`${base}/api/auth/signin`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email, password: seedPassword!, tenant }) });
  const setCookie = response.headers.get("set-cookie");
  if (response.status !== 303 || !setCookie) throw new Error(`Smoke login failed for ${email}/${tenant} (${response.status}): ${await response.text()}`);
  const cookie = setCookie.split(";", 1)[0]!;
  sessionTokenHashes.push(createHash("sha256").update(cookie.slice(cookie.indexOf("=") + 1)).digest("hex"));
  return cookie;
}

try {
  const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { slug: "colegio-pilares-demo" }, select: { id: true } });
  tenantAId = tenantA.id;
  const tenantB = await prisma.tenant.findUniqueOrThrow({ where: { slug: "escola-jardim-demo" }, select: { id: true } });
  const teacherA = await prisma.membership.findFirstOrThrow({ where: { tenantId: tenantA.id, role: "TEACHER", status: "ACTIVE" }, select: { id: true } });
  teacherMembershipId = teacherA.id;
  const teacherUser = await prisma.membership.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenantA.id, id: teacherA.id } }, select: { userId: true } });

  const teacherRateKey = rateKey("signin", (await prisma.user.findUniqueOrThrow({ where: { id: teacherUser.userId }, select: { email: true } })).email);
  if (!signinKeys.includes(teacherRateKey)) signinKeys.push(teacherRateKey);
  const teacherB = await prisma.membership.findFirstOrThrow({ where: { tenantId: tenantB.id, role: "TEACHER", status: "ACTIVE" }, select: { id: true } });
  const teacherBUser = await prisma.user.findUniqueOrThrow({ where: { id: (await prisma.membership.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenantB.id, id: teacherB.id } }, select: { userId: true } })).userId }, select: { email: true } });
  const teacherBRateKey = rateKey("signin", teacherBUser.email);
  if (!signinKeys.includes(teacherBRateKey)) signinKeys.push(teacherBRateKey);
  const rateBuckets = await prisma.rateLimitBucket.findMany({ where: { keyHash: { in: signinKeys } } });
  priorRateBuckets.splice(0, priorRateBuckets.length, ...rateBuckets);

  const year = new Date().getFullYear();
  const classroom = await prisma.classroom.create({ data: { tenantId: tenantA.id, name: classroomName, schoolYear: year, capacity: 2 }, select: { id: true } });
  classroomId = classroom.id;
  const student = await prisma.student.create({ data: { tenantId: tenantA.id, displayName: studentName }, select: { id: true } });
  studentId = student.id;
  const enrollment = await prisma.enrollment.create({ data: { tenantId: tenantA.id, studentId: student.id, classroomId: classroom.id, status: "ACTIVE" }, select: { id: true } });
  enrollmentId = enrollment.id;
  await prisma.classroomStaff.create({ data: { tenantId: tenantA.id, classroomId: classroom.id, membershipId: teacherA.id } });
  const entry = await prisma.journalEntry.create({ data: {
    tenantId: tenantA.id,
    classroomId: classroom.id,
    authorMembershipId: teacherA.id,
    happenedAt: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
    title: `Registro evidência ${suffix}`,
    description: "Atividade de smoke para validar upload e isolamento de evidências privadas.",
    status: "RECORDED",
    participants: { create: { tenant: { connect: { id: tenantA.id } }, enrollment: { connect: { tenantId_id: { tenantId: tenantA.id, id: enrollment.id } } } } },
  }, select: { id: true } });
  entryId = entry.id;

  const clamPort = await freePort();
  const webPort = await freePort();
  const base = `http://localhost:${webPort}`;
  webProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(webPort)], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "development", NEXT_DIST_DIR: smokeDistDir, APP_BASE_URL: base, PRIVATE_STORAGE_DRIVER: "auto", PRIVATE_STORAGE_LOCAL_DIR: "private-storage", S3_ENDPOINT: "", S3_REGION: "", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "", CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String(clamPort) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  webProcess.stdout?.setEncoding("utf8").on("data", (chunk: string) => { webOutput += chunk; });
  webProcess.stderr?.setEncoding("utf8").on("data", (chunk: string) => { webOutput += chunk; });
  await requireApp(`${base}/entrar`);

  const teacherCookie = await login(base, teacherBUser.email, "colegio-pilares-demo");
  const teacherBCookie = await login(base, teacherBUser.email, "escola-jardim-demo");
  const guardianCookie = await login(base, "familia.pilares.demo@turminha.local", "colegio-pilares-demo");
  const image = await sharp({ create: { width: 3, height: 3, channels: 3, background: { r: 150, g: 90, b: 220 } } }).png().toBuffer();
  const form = new FormData();
  form.append("files", new Blob([image], { type: "image/png" }), uploadFilename);
  const uploaded = await fetch(`${base}/api/app/colegio-pilares-demo/diario/${entry.id}/evidencias`, { method: "POST", redirect: "manual", headers: { origin: base, cookie: teacherCookie }, body: form });
  if (uploaded.status !== 303 || !uploaded.headers.get("location")?.includes("evidenceUploaded=1")) throw new Error(`Evidence upload did not complete (${uploaded.status}, ${uploaded.headers.get("location")}).`);

  const evidence = await prisma.journalEvidence.findFirstOrThrow({ where: { tenantId: tenantA.id, journalEntryId: entry.id }, select: { id: true, storageKey: true, status: true, scanStatus: true, byteSize: true } });
  evidenceId = evidence.id;
  if (!evidence.storageKey.startsWith(`local/${tenantA.id}/`) || evidence.status !== "QUARANTINED" || evidence.scanStatus !== "PENDING") throw new Error("With S3 and ClamAV unavailable, the upload was not persisted locally in quarantine.");
  const storedObject = await getPrivateObject(evidence.storageKey);
  if (storedObject.bytes.length !== evidence.byteSize || storedObject.bytes.length === 0) throw new Error("The private local object did not persist its re-encoded bytes.");
  const quarantinedDownload = await fetch(`${base}/api/app/colegio-pilares-demo/diario/${entry.id}/evidencias/${evidence.id}`, { headers: { cookie: teacherCookie } });
  if (quarantinedDownload.status !== 404) throw new Error(`Quarantined evidence was downloadable (${quarantinedDownload.status}).`);
  const familyDownload = await fetch(`${base}/api/app/colegio-pilares-demo/diario/${entry.id}/evidencias/${evidence.id}`, { headers: { cookie: guardianCookie } });
  if (familyDownload.status !== 403) throw new Error(`Family membership reached the staff evidence endpoint (${familyDownload.status}).`);
  const crossTenantDownload = await fetch(`${base}/api/app/escola-jardim-demo/diario/${entry.id}/evidencias/${evidence.id}`, { headers: { cookie: teacherBCookie } });
  if (crossTenantDownload.status !== 404) throw new Error(`Evidence crossed tenants (${crossTenantDownload.status}).`);
  const familyHtml = await (await fetch(`${base}/familia/colegio-pilares-demo`, { headers: { cookie: guardianCookie } })).text();
  if (familyHtml.includes(uploadFilename)) throw new Error("Journal evidence was exposed in the family portal.");

  clamServer = createServer((socket) => {
    socket.on("data", () => {});
    socket.on("end", () => socket.end("stream: OK\0"));
  });
  await new Promise<void>((resolve, reject) => {
    clamServer!.once("error", reject);
    clamServer!.listen(clamPort, "127.0.0.1", () => resolve());
  });
  await runEvidenceWorker(evidence.id, clamPort);
  const scanned = await prisma.journalEvidence.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenantA.id, id: evidence.id } }, select: { status: true, scanStatus: true, storageKey: true } });
  const scanJob = await prisma.journalEvidenceScanJob.findFirstOrThrow({ where: { tenantId: tenantA.id, journalEvidenceId: evidence.id }, select: { status: true } });
  if (scanned.status !== "PRIVATE" || scanned.scanStatus !== "CLEAN" || scanJob.status !== "DONE" || !scanned.storageKey.startsWith(`local/${tenantA.id}/`)) throw new Error("Evidence worker did not re-scan and release the local file after ClamAV became available.");
  const cleanDownload = await fetch(`${base}/api/app/colegio-pilares-demo/diario/${entry.id}/evidencias/${evidence.id}`, { headers: { cookie: teacherCookie } });
  if (cleanDownload.status !== 200 || Number(cleanDownload.headers.get("content-length")) !== evidence.byteSize) throw new Error(`Clean assigned staff download failed (${cleanDownload.status}).`);
  await prisma.classroomStaff.deleteMany({ where: { tenantId: tenantA.id, classroomId: classroom.id, membershipId: teacherA.id } });
  const revokedDownload = await fetch(`${base}/api/app/colegio-pilares-demo/diario/${entry.id}/evidencias/${evidence.id}`, { headers: { cookie: teacherCookie } });
  if (revokedDownload.status !== 404) throw new Error(`Revoked staff assignment still allowed download (${revokedDownload.status}).`);

  console.log(JSON.stringify({ storage: "auto fell back to local with S3 unavailable", scanner: "quarantined until ClamAV returned clean", worker: "targeted rescan released local object", tenantIsolation: "cross-tenant download denied", audience: "family endpoint denied and family projection omitted evidence", resourceAuthorization: "assigned staff allowed; revoked assignment denied" }));
} finally {
  stopChild(webProcess);
  await delay(250);
  const workspaceRoot = path.resolve(process.cwd());
  const smokeDistPath = path.resolve(process.cwd(), smokeDistDir);
  if (smokeDistPath.startsWith(`${workspaceRoot}${path.sep}`)) await rm(smokeDistPath, { recursive: true, force: true });
  if (clamServer) await new Promise<void>((resolve) => clamServer!.close(() => resolve()));
  if (tenantAId) {
    if (evidenceId) {
      const evidence = await prisma.journalEvidence.findFirst({ where: { tenantId: tenantAId, id: evidenceId }, select: { storageKey: true } });
      if (evidence?.storageKey) await deletePrivateObject(evidence.storageKey).catch(() => {});
      await prisma.storageOutbox.deleteMany({ where: { tenantId: tenantAId, idempotencyKey: { in: [`journal-evidence-delete:${evidenceId}`, `journal-evidence-relocate:${evidenceId}`] } } });
      await prisma.journalEvidenceScanJob.deleteMany({ where: { tenantId: tenantAId, journalEvidenceId: evidenceId } });
      await prisma.journalEvidence.deleteMany({ where: { tenantId: tenantAId, id: evidenceId } });
    }
    if (entryId) {
      await prisma.journalParticipant.deleteMany({ where: { tenantId: tenantAId, journalEntryId: entryId } });
      await prisma.journalEntry.deleteMany({ where: { tenantId: tenantAId, id: entryId } });
    }
    if (classroomId && teacherMembershipId) await prisma.classroomStaff.deleteMany({ where: { tenantId: tenantAId, classroomId, membershipId: teacherMembershipId } });
    if (enrollmentId) await prisma.enrollment.deleteMany({ where: { tenantId: tenantAId, id: enrollmentId } });
    if (studentId) await prisma.student.deleteMany({ where: { tenantId: tenantAId, id: studentId } });
    if (classroomId) await prisma.classroom.deleteMany({ where: { tenantId: tenantAId, id: classroomId, name: classroomName } });
  }
  if (sessionTokenHashes.length) await prisma.session.deleteMany({ where: { tokenHash: { in: sessionTokenHashes } } });
  if (signinKeys.length) {
    await prisma.rateLimitBucket.deleteMany({ where: { keyHash: { in: signinKeys } } });
    for (const previous of priorRateBuckets) await prisma.rateLimitBucket.create({ data: previous });
  }
  await prisma.$disconnect();
}
