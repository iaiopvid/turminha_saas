import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { hash as bcryptHash } from "bcryptjs";
import { PrismaClient, EnrollmentStatus } from "../src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

loadEnvFile(existsSync(".env.local") ? ".env.local" : ".env");
if (process.env.NODE_ENV === "production") throw new Error("M2 lifecycle smoke is blocked in production.");
const rawUrl = process.env.DATABASE_URL; const password = process.env.DEMO_SEED_PASSWORD; const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
if (!rawUrl || !password) throw new Error("Local DATABASE_URL and DEMO_SEED_PASSWORD are required.");
const dbUrl = new URL(rawUrl); const database = decodeURIComponent(dbUrl.pathname.replace(/^\//, ""));
if (dbUrl.protocol !== "mysql:" || !["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) || !/(?:_dev|_test)$/.test(database)) throw new Error("Lifecycle smoke requires a loopback *_dev or *_test database.");
const prisma = new PrismaClient({ adapter: new PrismaMariaDb({ host: dbUrl.hostname, port: Number(dbUrl.port || 3306), user: decodeURIComponent(dbUrl.username), password: decodeURIComponent(dbUrl.password), database, connectionLimit: 3 }) });
const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "colegio-pilares-demo" }, select: { id: true } });
const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "admin.demo@turminha.local" }, select: { id: true } });
const adminMembership = await prisma.membership.findUniqueOrThrow({ where: { tenantId_userId: { tenantId: tenant.id, userId: adminUser.id } }, select: { id: true } });
const suffix = Date.now().toString(); const classAName = `Lifecycle ${suffix} A`; const classBName = `Lifecycle ${suffix} B`; const email = `lifecycle-${suffix}@turminha.local`; const attackerEmail = `attacker-${suffix}@turminha.local`; const existingEmail = `existing-${suffix}@turminha.local`; const existingPassword = "ExistingAccountPassword!2032"; const year = 2032;
let classAId: string | undefined; let classBId: string | undefined; let studentId: string | undefined; let batchId: string | undefined; let importSourceId: string | undefined; let createdUserId: string | undefined; let existingTestUserId: string | undefined; let schoolYearId: string | undefined;
let rolloverSourceYearId: string | undefined; let rolloverTargetYearId: string | undefined; let rolloverClassId: string | undefined; let rolloverStudentId: string | undefined; let rolloverTargetClassId: string | undefined;
const previousPoliciesStep = await prisma.onboardingProgress.findUnique({ where: { tenantId_step: { tenantId: tenant.id, step: "policies" } } });
const invitationIds: string[] = [];
const rateSecret = process.env.RATE_LIMIT_SECRET ?? "turminha-local-rate-limit-secret-only";
const rateKey = (scope: string, identity: string) => createHmac("sha256", rateSecret).update(`${scope}\0${identity}`).digest("hex");
const signinTestEmail = `signin-${suffix}@turminha.local`;
const persistentRateKeys = [rateKey("signin", "admin.demo@turminha.local"), rateKey("signin", signinTestEmail), rateKey("invite-create", `${tenant.id}:${adminMembership.id}`)];
const previousRateBuckets = await prisma.rateLimitBucket.findMany({ where: { keyHash: { in: persistentRateKeys } } });
const api = async (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { ...init, redirect: "manual", headers: { origin: base, cookie, ...(init.headers ?? {}) } });
const invitationTokenHashes: string[] = [];
const testRateKeys: string[] = [];
const formPost = (path: string, fields: Record<string, string>) => api(path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });
const csv = (sourceId: string) => `record_type,source_id,name,email,student_source_id,school_year,classroom_name,role\nstudent,${sourceId},Criança teste lifecycle,,,${new Date().getFullYear()},${classAName},`;
let cookie = "";
try {
  const login = await fetch(`${base}/api/auth/signin`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email: "admin.demo@turminha.local", password, tenant: "colegio-pilares-demo" }) });
  if (login.status !== 303 || !login.headers.get("set-cookie")) throw new Error(`Admin login failed (${login.status}); start the local development server.`);
  cookie = login.headers.get("set-cookie")!.split(";", 1)[0]!;
  const classroomA = await prisma.classroom.create({ data: { tenantId: tenant.id, name: classAName, schoolYear: new Date().getFullYear(), capacity: 3 }, select: { id: true } }); classAId = classroomA.id;
  const classroomB = await prisma.classroom.create({ data: { tenantId: tenant.id, name: classBName, schoolYear: new Date().getFullYear(), capacity: 3 }, select: { id: true } }); classBId = classroomB.id;

  const importEndpoint = `/api/app/colegio-pilares-demo/gestao-escolar/importacao`;
  const sourceId = `source-${suffix}`; const csvText = csv(sourceId);
  const previewResponse = await api(importEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "preview", csv: csvText }) });
  const preview = await previewResponse.json() as { valid: boolean; rows: { sourceId: string }[] };
  if (previewResponse.status !== 200 || !preview.valid || preview.rows[0]?.sourceId !== sourceId) throw new Error("CSV preview did not validate the test row.");
  const dryResponse = await api(importEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "dry-run", rows: preview.rows }) });
  const dry = await dryResponse.json() as { valid: boolean };
  if (!dry.valid) throw new Error("CSV dry-run rejected the unchanged valid row.");
  const invalidDryResponse = await api(importEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "dry-run", rows: preview.rows.map((row) => ({ ...row, classroomName: "Turma que não existe" })) }) });
  const invalidDry = await invalidDryResponse.json() as { valid: boolean; rowIssues: { issues: { code: string }[] }[] };
  if (invalidDryResponse.status !== 200 || invalidDry.valid || !invalidDry.rowIssues[0]?.issues.some((issue) => issue.code === "CLASS_NOT_FOUND")) throw new Error("CSV dry-run did not identify a classroom outside the tenant's records.");
  const commitResponse = await api(importEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "commit", rows: preview.rows }) });
  const committed = await commitResponse.json() as { batchId: string; importedStudents: number; alreadyImported: boolean };
  if (commitResponse.status !== 201 || committed.importedStudents !== 1 || committed.alreadyImported) throw new Error("CSV commit did not persist exactly one student.");
  batchId = committed.batchId;
  const retry = await api(importEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "commit", rows: preview.rows }) });
  if (!(await retry.json() as { alreadyImported: boolean }).alreadyImported) throw new Error("CSV retry was not idempotent.");
  const imported = await prisma.importedStudentSource.findUniqueOrThrow({ where: { tenantId_sourceKey: { tenantId: tenant.id, sourceKey: sourceId } }, select: { id: true, studentId: true } }); importSourceId = imported.id; studentId = imported.studentId;
  const enrolled = await prisma.enrollment.findFirst({ where: { tenantId: tenant.id, studentId, classroomId: classAId, status: EnrollmentStatus.ACTIVE } });
  if (!enrolled) throw new Error("CSV commit did not create a same-tenant enrollment.");

  const transfer = await formPost(`/api/app/colegio-pilares-demo/gestao-escolar/transferencias`, { enrollmentId: enrolled.id, toClassroomId: classBId!, effectiveOn: new Date().toISOString().slice(0, 10), reason: "smoke lifecycle" });
  if (transfer.status !== 303 || !transfer.headers.get("location")?.includes("saved=1")) throw new Error(`Enrollment transfer failed (${transfer.status}).`);
  const history = await prisma.enrollmentTransfer.findFirst({ where: { tenantId: tenant.id, fromEnrollmentId: enrolled.id }, select: { toEnrollment: { select: { classroomId: true } } } });
  if (history?.toEnrollment.classroomId !== classBId) throw new Error("Transfer history did not retain both enrollment references.");
  const foreignClass = await prisma.classroom.findFirstOrThrow({ where: { tenantId: { not: tenant.id } }, select: { id: true } });
  const foreignTransfer = await formPost(`/api/app/colegio-pilares-demo/gestao-escolar/transferencias`, { enrollmentId: (await prisma.enrollment.findFirstOrThrow({ where: { tenantId: tenant.id, studentId, status: EnrollmentStatus.ACTIVE }, select: { id: true } })).id, toClassroomId: foreignClass.id, effectiveOn: new Date().toISOString().slice(0, 10), reason: "cross tenant" });
  if (foreignTransfer.status !== 403) throw new Error("Cross-tenant transfer target was not rejected.");

  const inviteResponse = await api(`/api/app/colegio-pilares-demo/convites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "GUARDIAN", email, displayName: "Responsável de teste", studentId, classroomId: null }) });
  const invite = await inviteResponse.json() as { invitationUrl: string };
  if (inviteResponse.status !== 201 || !invite.invitationUrl) throw new Error(`Guardian invite creation failed (${inviteResponse.status}).`);
  const inviteToken = invite.invitationUrl.split("/").at(-1)!;
  const inviteTokenHash = createHash("sha256").update(inviteToken).digest("hex"); invitationTokenHashes.push(inviteTokenHash);
  const invitePage = await fetch(`${base}${invite.invitationUrl}`, { redirect: "manual" });
  if (invitePage.status !== 200 || !(await invitePage.text()).includes("Responsável de teste")) throw new Error("Guardian invitation page failed to render its scoped summary.");
  const accepted = await fetch(`${base}/api/invitations/accept`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: inviteToken, displayName: "Responsável de teste", password: "LocalSmokePassword!2032", email: attackerEmail }) });
  if (accepted.status !== 303 || !accepted.headers.get("location")?.includes("email=unavailable") || accepted.headers.get("set-cookie")) throw new Error(`New account was not left pending when SMTP is unconfigured (${accepted.status}, ${accepted.headers.get("location")}).`);
  const savedInvite = await prisma.invitation.findUniqueOrThrow({ where: { tokenHash: inviteTokenHash }, select: { id: true, acceptedAt: true } });
  invitationIds.push(savedInvite.id);
  if (savedInvite.acceptedAt) throw new Error("Invitation was consumed before mailbox verification.");
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true, email: true, emailVerifiedAt: true, memberships: { where: { tenantId: tenant.id }, select: { id: true } }, emailVerifications: { select: { id: true, expiresAt: true, tokenHash: true } } } }); createdUserId = user.id; if (user.email.toLowerCase() !== email.toLowerCase() || await prisma.user.findUnique({ where: { email: attackerEmail }, select: { id: true } })) throw new Error("Invitation acceptance replaced its email with a browser-supplied address.");
  if (user.emailVerifiedAt || user.memberships.length || !user.emailVerifications.length) throw new Error("Pending email acceptance created an active membership or lacks a verification challenge.");
  testRateKeys.push(rateKey("email-verification-send", email.toLowerCase()));
  const retryDelivery = await fetch(`${base}/api/invitations/accept`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: inviteToken, displayName: "ResponsÃ¡vel de teste", password: "LocalSmokePassword!2032" }) });
  const afterRetry = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { emailVerifiedAt: true, memberships: { where: { tenantId: tenant.id }, select: { id: true } }, emailVerifications: { select: { id: true, expiresAt: true, tokenHash: true } } } });
  if (retryDelivery.status !== 303 || !retryDelivery.headers.get("location")?.includes("email=unavailable") || retryDelivery.headers.get("set-cookie") || afterRetry.emailVerifiedAt || afterRetry.memberships.length || afterRetry.emailVerifications.length < 2) throw new Error(`SMTP retry failure removed the pending marker or activated the account (status=${retryDelivery.status}, location=${new URL(retryDelivery.headers.get("location") ?? base, base).search}, cookie=${!!retryDelivery.headers.get("set-cookie")}, verified=${!!afterRetry.emailVerifiedAt}, memberships=${afterRetry.memberships.length}, challenges=${afterRetry.emailVerifications.length}).`);
  const verificationToken = randomBytes(32).toString("base64url"); const verificationTokenHash = createHash("sha256").update(verificationToken).digest("hex"); testRateKeys.push(rateKey("email-verification-complete", verificationTokenHash));
  const challenge = afterRetry.emailVerifications[0]!;
  await prisma.emailVerification.update({ where: { id: challenge.id }, data: { tokenHash: verificationTokenHash, expiresAt: new Date(Date.now() - 60_000) } });
  const expiredVerification = await fetch(`${base}/api/invitations/verify`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: verificationToken }) });
  if (expiredVerification.headers.get("set-cookie") || (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { emailVerifiedAt: true } })).emailVerifiedAt !== null) throw new Error("Expired mailbox confirmation activated the new account.");
  await prisma.emailVerification.update({ where: { id: challenge.id }, data: { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
  await prisma.invitation.update({ where: { id: savedInvite.id }, data: { revokedAt: new Date() } });
  const revokedVerification = await fetch(`${base}/api/invitations/verify`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: verificationToken }) });
  if (revokedVerification.headers.get("set-cookie") || (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { emailVerifiedAt: true } })).emailVerifiedAt) throw new Error("Email confirmation bypassed a revoked invitation.");
  await prisma.invitation.update({ where: { id: savedInvite.id }, data: { revokedAt: null } });
  const verifyPage = await fetch(`${base}/verificar-email/${verificationToken}`); const verifyHtml = await verifyPage.text();
  if (verifyPage.status !== 200 || !verifyHtml.includes("Confirme seu e-mail") || !verifyHtml.includes("Confirmar e acessar")) throw new Error("Mailbox confirmation page did not render the active challenge.");
  const confirmed = await fetch(`${base}/api/invitations/verify`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: verificationToken }) });
  if (confirmed.status !== 303 || !confirmed.headers.get("set-cookie") || !confirmed.headers.get("location")?.includes("/familia/colegio-pilares-demo")) throw new Error("Mailbox confirmation did not activate the invitation and establish a session.");
  const confirmedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { emailVerifiedAt: true, memberships: { where: { tenantId: tenant.id }, select: { id: true } } } });
  if (!confirmedUser.emailVerifiedAt || confirmedUser.memberships.length !== 1 || (await prisma.invitation.findUniqueOrThrow({ where: { id: savedInvite.id }, select: { acceptedAt: true } })).acceptedAt === null) throw new Error("Mailbox verification did not atomically activate the account and consume the invitation.");
  const verifyReplay = await fetch(`${base}/api/invitations/verify`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: verificationToken }) });
  if (verifyReplay.headers.get("set-cookie")) throw new Error("Mailbox verification token was reusable.");

  async function createGuardianInvite(inviteEmail: string) {
    const response = await api(`/api/app/colegio-pilares-demo/convites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "GUARDIAN", email: inviteEmail, displayName: "Convidado de teste", studentId, classroomId: null }) });
    const body = await response.json() as { invitationUrl?: string; error?: string };
    if (response.status !== 201 || !body.invitationUrl) throw new Error(`Additional test invite could not be created (${response.status}): ${body.error ?? "no link"}.`);
    const token = body.invitationUrl.split("/").at(-1)!; const tokenHash = createHash("sha256").update(token).digest("hex"); invitationTokenHashes.push(tokenHash);
    const record = await prisma.invitation.findUniqueOrThrow({ where: { tokenHash }, select: { id: true } }); invitationIds.push(record.id);
    return { token, tokenHash, url: body.invitationUrl, id: record.id };
  }
  const revoked = await createGuardianInvite(`revoked-${suffix}@turminha.local`);
  const revokeResponse = await api(`/api/app/colegio-pilares-demo/convites/${revoked.id}`, { method: "DELETE" });
  if (revokeResponse.status !== 200 || !(await prisma.invitation.findUniqueOrThrow({ where: { id: revoked.id }, select: { revokedAt: true } })).revokedAt) throw new Error("Invitation revoke did not persist.");
  const revokedPage = await fetch(`${base}${revoked.url}`); const revokedHtml = await revokedPage.text();
  const revokedAttempt = await fetch(`${base}/api/invitations/accept`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: revoked.token, displayName: "Convidado de teste", password: "RevokedInvitePassword!2032" }) });
  if (!revokedHtml.includes("foi revogado") || revokedHtml.includes("name=\"password\"") || revokedAttempt.headers.get("set-cookie")) throw new Error("Revoked invite remained usable.");

  const expired = await createGuardianInvite(`expired-${suffix}@turminha.local`);
  await prisma.invitation.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  const expiredPage = await fetch(`${base}${expired.url}`); const expiredHtml = await expiredPage.text();
  const expiredAttempt = await fetch(`${base}/api/invitations/accept`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: expired.token, displayName: "Convidado de teste", password: "ExpiredInvitePassword!2032" }) });
  if (!expiredHtml.includes("expirou") || expiredHtml.includes("name=\"password\"") || expiredAttempt.headers.get("set-cookie")) throw new Error("Expired invite remained usable.");

  const existingAccount = await prisma.user.create({ data: { email: existingEmail, displayName: "Conta existente", passwordHash: await bcryptHash(existingPassword, 12) }, select: { id: true } }); existingTestUserId = existingAccount.id;
  const existingInvite = await createGuardianInvite(existingEmail);
  for (let attempt = 0; attempt < 8; attempt++) {
    const wrong = await fetch(`${base}/api/invitations/accept`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: existingInvite.token, displayName: "Conta existente", password: "WrongExistingPassword!2032" }) });
    if (wrong.status !== 303 || !wrong.headers.get("location")?.includes("error=1")) throw new Error(`Existing account wrong password was not rejected on attempt ${attempt + 1}.`);
  }
  const throttled = await fetch(`${base}/api/invitations/accept`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: existingInvite.token, displayName: "Conta existente", password: existingPassword }) });
  if (!throttled.headers.get("location")?.includes("error=rate-limit") || (await prisma.invitation.findUniqueOrThrow({ where: { id: existingInvite.id }, select: { acceptedAt: true } })).acceptedAt) throw new Error("Repeated password attempts did not trigger the invite rate limit.");
  await prisma.rateLimitBucket.deleteMany({ where: { keyHash: rateKey("invite-accept", existingInvite.tokenHash) } });
  const existingAccepted = await fetch(`${base}/api/invitations/accept`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: existingInvite.token, displayName: "Conta existente", password: existingPassword }) });
  if (existingAccepted.status !== 303 || !existingAccepted.headers.get("set-cookie")) throw new Error("Existing account could not accept its invitation with the correct password.");
  if ((await prisma.user.findMany({ where: { email: existingEmail }, select: { id: true } })).length !== 1) throw new Error("Accepting a user invitation duplicated the existing account.");

  const onboarding = await formPost(`/api/app/colegio-pilares-demo/gestao-escolar/onboarding`, { step: "policies", completed: "true" });
  if (onboarding.status !== 303 || !onboarding.headers.get("location")?.includes("saved=1")) throw new Error("Onboarding progress was not saved.");
  const savedStep = await prisma.onboardingProgress.findUnique({ where: { tenantId_step: { tenantId: tenant.id, step: "policies" } }, select: { completedAt: true, updatedByMembershipId: true } });
  if (!savedStep?.completedAt) throw new Error("Onboarding checkpoint did not persist.");
  const rolloverTeacher = await prisma.membership.findFirstOrThrow({ where: { tenantId: tenant.id, role: "TEACHER", status: "ACTIVE" }, select: { id: true } });
  const sourceYear = await prisma.schoolYear.create({ data: { tenantId: tenant.id, year: 2090, startsOn: new Date("2090-01-01T00:00:00.000Z"), endsOn: new Date("2090-12-31T00:00:00.000Z") }, select: { id: true } }); rolloverSourceYearId = sourceYear.id;
  const sourceClass = await prisma.classroom.create({ data: { tenantId: tenant.id, name: `Rollover ${suffix}`, schoolYear: 2090, capacity: 1 }, select: { id: true } }); rolloverClassId = sourceClass.id;
  const calendarPage = await api(`/app/colegio-pilares-demo/calendario`); const calendarHtml = await calendarPage.text();
  if (calendarPage.status !== 200 || !calendarHtml.includes("Virada do ano letivo") || !calendarHtml.includes(sourceClass.id)) throw new Error("Calendar did not render the resumable year-rollover workflow.");
  const sourceStudent = await prisma.student.create({ data: { tenantId: tenant.id, displayName: `Rollover child ${suffix}` }, select: { id: true } }); rolloverStudentId = sourceStudent.id;
  const sourceEnrollment = await prisma.enrollment.create({ data: { tenantId: tenant.id, studentId: sourceStudent.id, classroomId: sourceClass.id, status: EnrollmentStatus.ACTIVE, validFrom: new Date("2090-01-01T00:00:00.000Z") }, select: { id: true } });
  const unsafeClose = await formPost(`/api/app/colegio-pilares-demo/calendario`, { action: "year:close", schoolYearId: sourceYear.id });
  if (unsafeClose.status !== 303 || !unsafeClose.headers.get("location")?.includes("rolloverRequired=1")) throw new Error("Closing an open year with active enrollment was not blocked.");
  const rolloverForm = new URLSearchParams({ action: "year:rollover", sourceYearId: sourceYear.id, year: "2091", startsOn: "2091-01-01", endsOn: "2091-12-31", carryStudents: "true", confirm: "yes", [`staff:${sourceClass.id}`]: rolloverTeacher.id }); rolloverForm.append("classroomId", sourceClass.id);
  const rolloverResponse = await api(`/api/app/colegio-pilares-demo/calendario`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: rolloverForm });
  if (rolloverResponse.status !== 303 || !rolloverResponse.headers.get("location")?.includes("rollover=1")) throw new Error(`School-year rollover failed (${rolloverResponse.status}, ${rolloverResponse.headers.get("location")}).`);
  const targetYear = await prisma.schoolYear.findUniqueOrThrow({ where: { tenantId_year: { tenantId: tenant.id, year: 2091 } }, select: { id: true, closedAt: true } }); rolloverTargetYearId = targetYear.id;
  const closedYear = await prisma.schoolYear.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenant.id, id: sourceYear.id } }, select: { closedAt: true } });
  const targetClass = await prisma.classroom.findUniqueOrThrow({ where: { tenantId_schoolYear_name: { tenantId: tenant.id, schoolYear: 2091, name: `Rollover ${suffix}` } }, select: { id: true } }); rolloverTargetClassId = targetClass.id;
  const closedEnrollment = await prisma.enrollment.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenant.id, id: sourceEnrollment.id } }, select: { status: true, validUntil: true } });
  const newEnrollment = await prisma.enrollment.findFirstOrThrow({ where: { tenantId: tenant.id, studentId: sourceStudent.id, classroomId: targetClass.id }, select: { id: true, status: true, validFrom: true } });
  if (!closedYear.closedAt || targetYear.closedAt || closedEnrollment.status !== EnrollmentStatus.FINISHED || newEnrollment.status !== EnrollmentStatus.ACTIVE || newEnrollment.validFrom.toISOString().slice(0, 10) !== "2091-01-01") throw new Error("Rollover did not preserve the old enrollment and create a current-year enrollment.");
  if (!await prisma.classroomStaff.findFirst({ where: { tenantId: tenant.id, classroomId: targetClass.id, membershipId: rolloverTeacher.id } })) throw new Error("Rollover did not save the explicitly revalidated staff assignment.");
  if (!await prisma.enrollmentTransfer.findFirst({ where: { tenantId: tenant.id, fromEnrollmentId: sourceEnrollment.id, toEnrollmentId: newEnrollment.id } })) throw new Error("Rollover history does not link the old and new enrollments.");
  const duplicateYear = await prisma.schoolYear.findUnique({ where: { tenantId_year: { tenantId: tenant.id, year } }, select: { id: true } });
  if (!duplicateYear) {
    const yearResponse = await formPost(`/api/app/colegio-pilares-demo/calendario`, { action: "year:create", year: String(year), startsOn: `${year}-01-01`, endsOn: `${year}-12-31` });
    if (yearResponse.status !== 303 || !yearResponse.headers.get("location")?.includes("saved=1")) throw new Error("School year could not be created.");
    schoolYearId = (await prisma.schoolYear.findUniqueOrThrow({ where: { tenantId_year: { tenantId: tenant.id, year } }, select: { id: true } })).id;
    const event = await formPost(`/api/app/colegio-pilares-demo/calendario`, { action: "entry:create", schoolYearId, kind: "HOLIDAY", title: "Smoke feriado", startsOn: `${year}-05-01`, endsOn: `${year}-05-01` });
    if (event.status !== 303 || !event.headers.get("location")?.includes("saved=1")) throw new Error("Calendar entry could not be created within its school year.");
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    const wrongLogin = await fetch(`${base}/api/auth/signin`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email: signinTestEmail, password: "WrongAdminPassword!2032", tenant: "colegio-pilares-demo" }) });
    if (wrongLogin.status !== 303 || !wrongLogin.headers.get("location")?.includes("error=1")) throw new Error(`Login rate limit activated before the configured threshold at attempt ${attempt + 1}.`);
  }
  const loginThrottled = await fetch(`${base}/api/auth/signin`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email: signinTestEmail, password: password!, tenant: "colegio-pilares-demo" }) });
  if (!loginThrottled.headers.get("location")?.includes("limit=1") || loginThrottled.headers.get("set-cookie")) throw new Error("Repeated login attempts were not rate-limited.");
  const limitedInvite = { role: "GUARDIAN", email: `rate-create-${suffix}@turminha.local`, displayName: "Rate limit smoke", studentId, classroomId: null };
  for (let attempt = 0; attempt < 21; attempt++) {
    const response = await api(`/api/app/colegio-pilares-demo/convites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(limitedInvite) });
    if (attempt === 0 && response.status === 201) {
      const created = await response.json() as { invitationUrl: string }; const tokenHash = createHash("sha256").update(created.invitationUrl.split("/").at(-1)!).digest("hex"); invitationTokenHashes.push(tokenHash);
      const record = await prisma.invitation.findUniqueOrThrow({ where: { tokenHash }, select: { id: true } }); invitationIds.push(record.id);
    } else if (response.status !== 409) throw new Error(`Repeated invite create was unexpected before the limit (${response.status}).`);
  }
  const createThrottled = await api(`/api/app/colegio-pilares-demo/convites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(limitedInvite) });
  if (createThrottled.status !== 429 || !createThrottled.headers.get("retry-after")) throw new Error("Repeated invite creation did not return 429 with Retry-After.");
  console.log(JSON.stringify({ csv: "preview, dry-run, persisted commit and idempotent retry passed", transfers: "history persisted; cross-tenant destination denied", invitations: "browser-supplied email substitution rejected; new account stays pending until mailbox token confirms; expired/revoked/replayed confirmation denied; existing account password required; invite/email and auth throttles passed; SMTP absence explicit", onboarding: "resume checkpoint persisted", calendar: schoolYearId ? "year and bounded event persisted" : "existing school year was safely reused", yearRollover: "unsafe close blocked; source history closed; selected class, explicitly selected staff and student enrollment carried into the new year" }));
} finally {
  for (const [knownUserId, testEmail] of [[createdUserId, email], [existingTestUserId, existingEmail], [undefined, attackerEmail]] as const) {
    const testUserId = knownUserId ?? (await prisma.user.findUnique({ where: { email: testEmail }, select: { id: true } }))?.id;
    if (!testUserId) continue;
    await prisma.session.deleteMany({ where: { userId: testUserId } });
    const membership = await prisma.membership.findFirst({ where: { tenantId: tenant.id, userId: testUserId }, select: { id: true } });
    if (membership) { await prisma.studentGuardian.deleteMany({ where: { tenantId: tenant.id, membershipId: membership.id } }); await prisma.classroomStaff.deleteMany({ where: { tenantId: tenant.id, membershipId: membership.id } }); await prisma.membership.delete({ where: { id: membership.id } }); }
    await prisma.user.deleteMany({ where: { id: testUserId, email: testEmail } });
  }
  await prisma.invitation.deleteMany({ where: { tenantId: tenant.id, OR: [{ id: { in: invitationIds } }, { tokenHash: { in: invitationTokenHashes } }] } });
  if (studentId) {
    const studentEnrollments = await prisma.enrollment.findMany({ where: { tenantId: tenant.id, studentId }, select: { id: true } }); const enrollmentIds = studentEnrollments.map((item) => item.id);
    await prisma.enrollmentTransfer.deleteMany({ where: { tenantId: tenant.id, OR: [{ fromEnrollmentId: { in: enrollmentIds } }, { toEnrollmentId: { in: enrollmentIds } }] } });
    await prisma.enrollment.deleteMany({ where: { tenantId: tenant.id, id: { in: enrollmentIds } } });
    await prisma.studentGuardian.deleteMany({ where: { tenantId: tenant.id, studentId } });
    await prisma.importedStudentSource.deleteMany({ where: { tenantId: tenant.id, studentId } });
    await prisma.student.deleteMany({ where: { tenantId: tenant.id, id: studentId } });
  }
  if (rolloverStudentId) {
    const ids = await prisma.enrollment.findMany({ where: { tenantId: tenant.id, studentId: rolloverStudentId }, select: { id: true } });
    await prisma.enrollmentTransfer.deleteMany({ where: { tenantId: tenant.id, OR: [{ fromEnrollmentId: { in: ids.map((item) => item.id) } }, { toEnrollmentId: { in: ids.map((item) => item.id) } }] } });
    await prisma.enrollment.deleteMany({ where: { tenantId: tenant.id, id: { in: ids.map((item) => item.id) } } });
    await prisma.student.deleteMany({ where: { tenantId: tenant.id, id: rolloverStudentId } });
  }
  const rolloverClassIds = [rolloverClassId, rolloverTargetClassId].filter((id): id is string => !!id);
  if (rolloverClassIds.length) { await prisma.classroomStaff.deleteMany({ where: { tenantId: tenant.id, classroomId: { in: rolloverClassIds } } }); await prisma.classroom.deleteMany({ where: { tenantId: tenant.id, id: { in: rolloverClassIds } } }); }
  const rolloverYearIds = [rolloverSourceYearId, rolloverTargetYearId].filter((id): id is string => !!id);
  if (rolloverYearIds.length) { await prisma.calendarEntry.deleteMany({ where: { tenantId: tenant.id, schoolYearId: { in: rolloverYearIds } } }); await prisma.schoolYear.deleteMany({ where: { tenantId: tenant.id, id: { in: rolloverYearIds } } }); }
  if (batchId) await prisma.importBatch.deleteMany({ where: { tenantId: tenant.id, id: batchId } });
  if (classAId) { await prisma.classroomStaff.deleteMany({ where: { tenantId: tenant.id, classroomId: classAId } }); await prisma.classroom.deleteMany({ where: { tenantId: tenant.id, id: classAId } }); }
  if (classBId) await prisma.classroom.deleteMany({ where: { tenantId: tenant.id, id: classBId } });
  if (schoolYearId) { await prisma.calendarEntry.deleteMany({ where: { tenantId: tenant.id, schoolYearId } }); await prisma.schoolYear.deleteMany({ where: { tenantId: tenant.id, id: schoolYearId } }); }
  if (importSourceId) await prisma.importedStudentSource.deleteMany({ where: { tenantId: tenant.id, id: importSourceId } });
  const smokeRateKeys = [...persistentRateKeys, ...invitationTokenHashes.map((tokenHash) => rateKey("invite-accept", tokenHash)), ...testRateKeys];
  await prisma.rateLimitBucket.deleteMany({ where: { keyHash: { in: smokeRateKeys } } });
  for (const bucket of previousRateBuckets) await prisma.rateLimitBucket.create({ data: bucket });
  if (previousPoliciesStep) await prisma.onboardingProgress.update({ where: { tenantId_step: { tenantId: tenant.id, step: "policies" } }, data: { updatedByMembershipId: previousPoliciesStep.updatedByMembershipId, completedAt: previousPoliciesStep.completedAt, updatedAt: previousPoliciesStep.updatedAt } });
  else await prisma.onboardingProgress.deleteMany({ where: { tenantId: tenant.id, step: "policies" } });
  await prisma.$disconnect();
}
