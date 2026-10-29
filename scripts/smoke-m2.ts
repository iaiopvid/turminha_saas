import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { EnrollmentStatus, PrismaClient } from "../src/generated/prisma/client.js";
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
const unassignedClassroomName = `Scope M2 ${suffix}`;
const firstStudentName = `Criança M2 ${suffix} A`;
const secondStudentName = `Criança M2 ${suffix} B`;
const secondGuardianEmail = `guardian-${suffix}@turminha.local`;
const year = new Date().getFullYear();
const unitB = await prisma.schoolUnit.findFirstOrThrow({ where: { tenantId: tenantB.id }, select: { id: true } });
const teacherB = await prisma.membership.findFirstOrThrow({ where: { tenantId: tenantB.id, role: "TEACHER", status: "ACTIVE" }, select: { id: true } });
const guardianA = await prisma.membership.findFirstOrThrow({ where: { tenantId: tenantA.id, role: "GUARDIAN", status: "ACTIVE" }, select: { id: true } });
const teacherPassword = password;
const rateSecret = process.env.RATE_LIMIT_SECRET ?? "turminha-local-rate-limit-secret-only";
const rateKey = (scope: string, identity: string) => createHmac("sha256", rateSecret).update(`${scope}\0${identity}`).digest("hex");
const testRateKeys = [rateKey("signin", "admin.demo@turminha.local"), rateKey("signin", "professora.demo@turminha.local"), rateKey("signin", "familia.pilares.demo@turminha.local"), rateKey("signin", secondGuardianEmail)];
const previousRateBuckets = await prisma.rateLimitBucket.findMany({ where: { keyHash: { in: testRateKeys } } });
const sessionTokenHashes: string[] = [];

async function login(email = "admin.demo@turminha.local") {
  const body = new URLSearchParams({ email, password: teacherPassword, tenant: "colegio-pilares-demo" });
  const response = await fetch(`${base}/api/auth/signin`, { method: "POST", redirect: "manual", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body });
  if (response.status !== 303 || !response.headers.get("set-cookie")) throw new Error(`Admin login failed (${response.status}).`);
  const cookie = response.headers.get("set-cookie")!.split(";", 1)[0]!;
  sessionTokenHashes.push(createHash("sha256").update(cookie.slice(cookie.indexOf("=") + 1)).digest("hex"));
  return cookie;
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
let unassignedClassroomId: string | undefined;
let unitId: string | undefined;
let mediaId: string | undefined;
let familyMediaId: string | undefined;
let familyRevisionId: string | undefined;
let familySubmissionId: string | undefined;
const familyPageAssetIds: string[] = [];
const familyPageSubmissionIds: string[] = [];
let secondGuardianUserId: string | undefined;
let secondGuardianMembershipId: string | undefined;
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
  await requireSaved({ action: "classroom:create", name: unassignedClassroomName, schoolYear: String(year), capacity: "3", unitId: unit.id });
  unassignedClassroomId = (await prisma.classroom.findUniqueOrThrow({ where: { tenantId_schoolYear_name: { tenantId: tenantA.id, schoolYear: year, name: unassignedClassroomName } }, select: { id: true } })).id;

  await requireSaved({ action: "student:create", classroomId: classroom.id, displayName: firstStudentName });
  await requireSaved({ action: "student:create", classroomId: classroom.id, displayName: secondStudentName });
  const enrollments = await prisma.enrollment.findMany({ where: { tenantId: tenantA.id, classroomId: classroom.id }, select: { status: true, student: { select: { displayName: true } } }, orderBy: { student: { displayName: "asc" } } });
  if (enrollments.length !== 2 || enrollments.filter((row) => row.status === "ACTIVE").length !== 1 || enrollments.filter((row) => row.status === "WAITLISTED").length !== 1) throw new Error("Capacity did not place the second learner on the waitlist.");

  const teacherA = await prisma.membership.findFirstOrThrow({ where: { tenantId: tenantA.id, role: "TEACHER", status: "ACTIVE" }, select: { id: true } });
  await requireSaved({ action: "staff:assign", classroomId: classroom.id, membershipId: teacherA.id });
  if (!await prisma.classroomStaff.findFirst({ where: { tenantId: tenantA.id, classroomId: classroom.id, membershipId: teacherA.id } })) throw new Error("The same-tenant teacher assignment was not persisted.");
  const teacherCookie = await login("professora.demo@turminha.local");
  const assignedEnrollment = await prisma.enrollment.findFirstOrThrow({ where: { tenantId: tenantA.id, classroomId: classroom.id, status: EnrollmentStatus.ACTIVE }, select: { id: true } });
  const classDate = "2099-12-30";
  const classDateValue = new Date(`${classDate}T00:00:00.000Z`);
  const unassignedClassCall = await fetch(`${base}/api/app/colegio-pilares-demo/frequencia`, { method: "POST", redirect: "manual", headers: { origin: base, cookie: teacherCookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ classroomId: unassignedClassroomId!, classDate, [`status:${assignedEnrollment.id}`]: "PRESENT" }) });
  if (unassignedClassCall.status !== 403) throw new Error("Teacher could write attendance for a classroom they were not assigned to.");
  const foreignEnrollment = await prisma.enrollment.findFirstOrThrow({ where: { tenantId: tenantB.id, status: EnrollmentStatus.ACTIVE }, select: { id: true } });
  const foreignStudentCall = await fetch(`${base}/api/app/colegio-pilares-demo/frequencia`, { method: "POST", redirect: "manual", headers: { origin: base, cookie: teacherCookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ classroomId: classroom.id, classDate, [`status:${foreignEnrollment.id}`]: "PRESENT" }) });
  if (foreignStudentCall.status !== 403) throw new Error("Teacher attendance accepted an enrollment from another tenant.");
  if (await prisma.attendance.count({ where: { tenantId: tenantA.id, classDate: classDateValue, enrollmentId: assignedEnrollment.id } })) throw new Error("Rejected attendance attempt created a record.");
  const scopedNoticeTitle = `Scope smoke ${suffix}`;
  const unassignedNotice = await fetch(`${base}/api/app/colegio-pilares-demo/recados`, { method: "POST", redirect: "manual", headers: { origin: base, cookie: teacherCookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ classroomId: unassignedClassroomId!, title: scopedNoticeTitle, body: "Teacher scope guard" }) });
  if (unassignedNotice.status !== 403 || await prisma.announcement.count({ where: { tenantId: tenantA.id, classroomId: unassignedClassroomId, title: scopedNoticeTitle } })) throw new Error("Teacher was able to publish a notice to an unassigned classroom.");
  const protectedAdminRoutes: { path: string; contentType: string; body: string }[] = [
    { path: "/api/app/colegio-pilares-demo/calendario", contentType: "application/x-www-form-urlencoded", body: "action=invalid" },
    { path: "/api/app/colegio-pilares-demo/gestao-escolar/importacao", contentType: "application/json", body: JSON.stringify({ action: "preview", csv: "" }) },
    { path: "/api/app/colegio-pilares-demo/gestao-escolar/transferencias", contentType: "application/x-www-form-urlencoded", body: "" },
    { path: "/api/app/colegio-pilares-demo/gestao-escolar/onboarding", contentType: "application/x-www-form-urlencoded", body: "step=invalid&completed=true" },
    { path: "/api/app/colegio-pilares-demo/convites", contentType: "application/json", body: JSON.stringify({}) },
  ];
  for (const route of protectedAdminRoutes) {
    const response = await fetch(`${base}${route.path}`, { method: "POST", redirect: "manual", headers: { origin: base, cookie: teacherCookie, "content-type": route.contentType }, body: route.body });
    if (response.status !== 403) throw new Error(`Teacher reached admin-only endpoint ${route.path} (${response.status}).`);
  }
  const studentForGuardian = await prisma.student.findFirstOrThrow({ where: { tenantId: tenantA.id, displayName: firstStudentName }, select: { id: true } });
  await requireSaved({ action: "guardian:link", studentId: studentForGuardian.id, membershipId: guardianA.id });
  const guardianLink = await prisma.studentGuardian.findUniqueOrThrow({ where: { tenantId_studentId_membershipId: { tenantId: tenantA.id, studentId: studentForGuardian.id, membershipId: guardianA.id } }, select: { approved: true, revokedAt: true } });
  if (guardianLink.approved || guardianLink.revokedAt) throw new Error("A school-created guardian link must remain pending family confirmation.");
  await prisma.studentGuardian.update({ where: { tenantId_studentId_membershipId: { tenantId: tenantA.id, studentId: studentForGuardian.id, membershipId: guardianA.id } }, data: { approved: true } });
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "admin.demo@turminha.local" }, select: { passwordHash: true } });
  const secondGuardian = await prisma.user.create({ data: { email: secondGuardianEmail, displayName: `Responsável smoke ${suffix}`, passwordHash: adminUser.passwordHash, emailVerifiedAt: new Date() }, select: { id: true } });
  secondGuardianUserId = secondGuardian.id;
  const secondMembership = await prisma.membership.create({ data: { tenantId: tenantA.id, userId: secondGuardian.id, role: "GUARDIAN", status: "ACTIVE" }, select: { id: true } });
  secondGuardianMembershipId = secondMembership.id;
  await prisma.studentGuardian.create({ data: { tenantId: tenantA.id, studentId: studentForGuardian.id, membershipId: secondMembership.id, approved: true } });
  const familyCookieA = await login("familia.pilares.demo@turminha.local");
  const familyCookieB = await login(secondGuardianEmail);
  const familyA = await (await fetch(`${base}/familia/colegio-pilares-demo`, { headers: { cookie: familyCookieA } })).text();
  const familyB = await (await fetch(`${base}/familia/colegio-pilares-demo`, { headers: { cookie: familyCookieB } })).text();
  if (!familyA.includes(firstStudentName) || !familyB.includes(firstStudentName) || familyB.includes("Lia Exemplo")) throw new Error("Two separate guardian accounts did not show only their approved child links.");
  familyMediaId = `family_media_${suffix}`;
  await prisma.mediaAsset.create({ data: { id: familyMediaId, tenantId: tenantA.id, studentId: studentForGuardian.id, uploadedByMembershipId: guardianA.id, title: `Álbum privado ${suffix}`, category: "ACTIVITY", storageKey: `${tenantA.id}/${familyMediaId}`, originalFilename: "family-fixture.webp", contentType: "image/webp", byteSize: 3, checksumSha256: "0".repeat(64), scanStatus: "CLEAN", status: "PRIVATE" } });
  await prisma.mediaConsent.createMany({ data: ["PRIVATE_STORAGE", "SCHOOL_REVIEW"].map((purpose) => ({ tenantId: tenantA.id, mediaAssetId: familyMediaId!, membershipId: guardianA.id, purpose: purpose as "PRIVATE_STORAGE" | "SCHOOL_REVIEW" })) });
  familySubmissionId = `fsub_${suffix}`;
  const familySubmission = await prisma.mediaSubmission.create({ data: { id: familySubmissionId, threadId: familySubmissionId, tenantId: tenantA.id, mediaAssetId: familyMediaId, studentId: studentForGuardian.id, submittedByMembershipId: guardianA.id, status: "SUBMITTED" }, select: { id: true } });
  await prisma.mediaReviewEvent.create({ data: { tenantId: tenantA.id, submissionId: familySubmission.id, actorMembershipId: guardianA.id, actorDisplayName: "Responsável smoke", actorRole: "GUARDIAN", fromStatus: null, toStatus: "SUBMITTED" } });
  for (let index = 0; index < 21; index += 1) {
    familyPageAssetIds.push(`pgm_${suffix}_${index}`);
    familyPageSubmissionIds.push(`pgs_${suffix}_${index}`);
  }
  await prisma.mediaAsset.createMany({ data: familyPageAssetIds.map((id, index) => ({ id, tenantId: tenantA.id, studentId: studentForGuardian.id, uploadedByMembershipId: guardianA.id, title: `Página ${index + 1} ${suffix}`, category: "ACTIVITY" as const, storageKey: `${tenantA.id}/${id}`, originalFilename: "fixture.webp", contentType: "image/webp", byteSize: 3, checksumSha256: "0".repeat(64), scanStatus: "CLEAN", status: "PRIVATE" })) });
  await prisma.mediaConsent.createMany({ data: familyPageAssetIds.flatMap((mediaAssetId) => ["PRIVATE_STORAGE", "SCHOOL_REVIEW"].map((purpose) => ({ tenantId: tenantA.id, mediaAssetId, membershipId: guardianA.id, purpose: purpose as "PRIVATE_STORAGE" | "SCHOOL_REVIEW" }))) });
  await prisma.mediaSubmission.createMany({ data: familyPageSubmissionIds.map((id, index) => ({ id, threadId: id, tenantId: tenantA.id, mediaAssetId: familyPageAssetIds[index]!, studentId: studentForGuardian.id, submittedByMembershipId: guardianA.id, status: "SUBMITTED" as const })) });
  const [ownerAlbum, ownerAlbumPageTwo, otherGuardianAlbum, reviewerPage, reviewerPageTwoUnfiltered] = await Promise.all([
    fetch(`${base}/familia/colegio-pilares-demo`, { headers: { cookie: familyCookieA } }).then((response) => response.text()),
    fetch(`${base}/familia/colegio-pilares-demo?page=2`, { headers: { cookie: familyCookieA } }).then((response) => response.text()),
    fetch(`${base}/familia/colegio-pilares-demo`, { headers: { cookie: familyCookieB } }).then((response) => response.text()),
    fetch(`${base}/app/colegio-pilares-demo/midias`, { headers: { cookie: teacherCookie } }).then((response) => response.text()),
    fetch(`${base}/app/colegio-pilares-demo/midias?page=2`, { headers: { cookie: teacherCookie } }).then((response) => response.text()),
  ]);
  if (!ownerAlbum.includes("page=2") || !ownerAlbumPageTwo.includes(`Álbum privado ${suffix}`) || otherGuardianAlbum.includes(`Álbum privado ${suffix}`) || otherGuardianAlbum.includes("page=2") || !reviewerPage.includes("page=2") || !reviewerPageTwoUnfiltered.includes(`Álbum privado ${suffix}`)) throw new Error("Family album isolation or server-paginated review/family page access failed.");
  const reviewPageTwo = await fetch(`${base}/app/colegio-pilares-demo/midias?status=SUBMITTED&studentId=${studentForGuardian.id}&authorId=${guardianA.id}&page=2`, { headers: { cookie: teacherCookie } });
  const reviewPageTwoHtml = await reviewPageTwo.text();
  const foreignClassroom = await prisma.classroom.findFirstOrThrow({ where: { tenantId: tenantB.id, status: "ACTIVE" }, select: { id: true } });
  const foreignFilterHtml = await (await fetch(`${base}/app/colegio-pilares-demo/midias?status=ALL&classroomId=${foreignClassroom.id}`, { headers: { cookie: teacherCookie } })).text();
  if (reviewPageTwo.status !== 200 || !reviewPageTwoHtml.includes("page=2") || !reviewPageTwoHtml.includes("Página ") || foreignFilterHtml.includes(`Álbum privado ${suffix}`) || foreignFilterHtml.includes(`Página 1 ${suffix}`)) throw new Error(`Numbered review filters failed: ${JSON.stringify({ status: reviewPageTwo.status, pageTwo: reviewPageTwoHtml.includes("page=2"), fixture: reviewPageTwoHtml.includes("Página "), foreignAlbum: foreignFilterHtml.includes(`Álbum privado ${suffix}`), foreignFixture: foreignFilterHtml.includes(`Página 1 ${suffix}`), emptyMessage: foreignFilterHtml.match(/0.{0,30}envio/i)?.[0] ?? "missing" })}.`);
  const otherGuardianDownload = await fetch(`${base}/api/app/colegio-pilares-demo/midias/${familyMediaId}`, { headers: { cookie: familyCookieB } });
  if (otherGuardianDownload.status !== 404) throw new Error("Another approved guardian could access a private upload they did not own.");
  const familyReview = await fetch(`${base}/api/app/colegio-pilares-demo/midias/submissions/${familySubmission.id}`, { method: "POST", redirect: "manual", headers: { origin: base, cookie: teacherCookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ action: "CHANGES_REQUESTED", comment: "Envie uma versão com melhor foco." }) });
  if (familyReview.status !== 303 || (await prisma.mediaSubmission.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenantA.id, id: familySubmission.id } }, select: { status: true } })).status !== "CHANGES_REQUESTED") throw new Error("Authorized teacher did not record a change request.");
  const ownerChangeRequest = await (await fetch(`${base}/familia/colegio-pilares-demo?page=2`, { headers: { cookie: familyCookieA } })).text();
  const retryBody = new FormData();
  for (const [key, value] of Object.entries({ studentId: studentForGuardian.id, priorSubmissionId: familySubmission.id, title: `Álbum privado ${suffix}`, category: "ACTIVITY", submitToSchool: "true", privateConsent: "yes", schoolConsent: "yes" })) retryBody.set(key, value);
  retryBody.set("file", new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), "new-version.jpg");
  const noStorageSubmissionCount = await prisma.mediaSubmission.count({ where: { tenantId: tenantA.id, studentId: studentForGuardian.id, submittedByMembershipId: guardianA.id } });
  const resubmitWithoutStorage = await fetch(`${base}/api/familia/colegio-pilares-demo/recordacoes`, { method: "POST", redirect: "manual", headers: { origin: base, cookie: familyCookieA }, body: retryBody });
  const resubmitLocation = resubmitWithoutStorage.headers.get("location") ?? "";
  const resubmitCountAfter = await prisma.mediaSubmission.count({ where: { tenantId: tenantA.id, studentId: studentForGuardian.id, submittedByMembershipId: guardianA.id } });
  if (!ownerChangeRequest.includes("Enviar uma nova versão para revisão") || resubmitWithoutStorage.status !== 303 || !/memory=(storage|invalid)/.test(resubmitLocation) || resubmitCountAfter !== noStorageSubmissionCount) throw new Error(`Versioned resubmission check failed: ${JSON.stringify({ form: ownerChangeRequest.includes("Enviar uma nova versão para revisão"), status: resubmitWithoutStorage.status, location: resubmitLocation, before: noStorageSubmissionCount, after: resubmitCountAfter })}.`);
  familyRevisionId = `family_revision_${suffix}`;
  const revisionSubmissionId = `rsub_${suffix}`;
  await prisma.mediaAsset.create({ data: { id: familyRevisionId, tenantId: tenantA.id, studentId: studentForGuardian.id, uploadedByMembershipId: guardianA.id, title: `Álbum privado ${suffix} nova versão`, category: "ACTIVITY", storageKey: `${tenantA.id}/${familyRevisionId}`, originalFilename: "revision.webp", contentType: "image/webp", byteSize: 3, checksumSha256: "1".repeat(64), scanStatus: "CLEAN", status: "PRIVATE" } });
  await prisma.mediaConsent.createMany({ data: ["PRIVATE_STORAGE", "SCHOOL_REVIEW"].map((purpose) => ({ tenantId: tenantA.id, mediaAssetId: familyRevisionId!, membershipId: guardianA.id, purpose: purpose as "PRIVATE_STORAGE" | "SCHOOL_REVIEW" })) });
  await prisma.mediaSubmission.create({ data: { id: revisionSubmissionId, threadId: familySubmission.id, supersedesId: familySubmission.id, version: 2, tenantId: tenantA.id, mediaAssetId: familyRevisionId, studentId: studentForGuardian.id, submittedByMembershipId: guardianA.id, status: "SUBMITTED" } });
  await prisma.mediaReviewEvent.create({ data: { tenantId: tenantA.id, submissionId: revisionSubmissionId, actorMembershipId: guardianA.id, actorDisplayName: "Responsável smoke", actorRole: "GUARDIAN", fromStatus: null, toStatus: "SUBMITTED", comment: "Reenvio de versão 2." } });
  const approveRevision = await fetch(`${base}/api/app/colegio-pilares-demo/midias/submissions/${revisionSubmissionId}`, { method: "POST", redirect: "manual", headers: { origin: base, cookie: teacherCookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ action: "APPROVED" }) });
  const historyPage = await (await fetch(`${base}/app/colegio-pilares-demo/midias?status=ALL&studentId=${studentForGuardian.id}&authorId=${guardianA.id}`, { headers: { cookie: teacherCookie } })).text();
  if (approveRevision.status !== 303 || !/Versão(?:\s|<!-- -->)*1/.test(historyPage) || !/Versão(?:\s|<!-- -->)*2/.test(historyPage) || !historyPage.includes("Histórico de versões e decisões")) throw new Error(`Review history rendering failed: ${JSON.stringify({ status: approveRevision.status, versions: historyPage.match(/Versão.{0,20}/g)?.slice(0,4) ?? [], history: historyPage.includes("Histórico de versões e decisões") })}.`);
  const revokeReview = await fetch(`${base}/api/familia/colegio-pilares-demo/recordacoes/${familyRevisionId}`, { method: "POST", redirect: "manual", headers: { origin: base, cookie: familyCookieA, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ purpose: "SCHOOL_REVIEW" }) });
  const afterReviewWithdrawal = await prisma.mediaSubmission.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenantA.id, id: revisionSubmissionId } }, select: { status: true } });
  const assetAfterReviewWithdrawal = await prisma.mediaAsset.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenantA.id, id: familyRevisionId } }, select: { status: true } });
  if (revokeReview.status !== 303 || afterReviewWithdrawal.status !== "WITHDRAWN" || assetAfterReviewWithdrawal.status !== "PRIVATE") throw new Error("Withdrawing school review did not revoke reviewer access while preserving the private copy.");
  const revokePrivate = await fetch(`${base}/api/familia/colegio-pilares-demo/recordacoes/${familyRevisionId}`, { method: "POST", redirect: "manual", headers: { origin: base, cookie: familyCookieA, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ purpose: "PRIVATE_STORAGE" }) });
  const privateAfterWithdrawal = await prisma.mediaAsset.findUniqueOrThrow({ where: { tenantId_id: { tenantId: tenantA.id, id: familyRevisionId } }, select: { status: true } });
  const cleanupEvent = await prisma.storageOutbox.findFirst({ where: { tenantId: tenantA.id, idempotencyKey: `media-delete:${familyRevisionId}`, status: "PENDING" }, select: { id: true } });
  if (revokePrivate.status !== 303 || privateAfterWithdrawal.status !== "WITHDRAWN" || !cleanupEvent) throw new Error("Private storage withdrawal did not immediately block the media and queue idempotent cleanup.");
  const ownerAfterWithdrawal = await fetch(`${base}/api/app/colegio-pilares-demo/midias/${familyRevisionId}`, { headers: { cookie: familyCookieA } });
  if (ownerAfterWithdrawal.status !== 404) throw new Error("A withdrawn private asset remained downloadable.");
  await requireSaved({ action: "guardian:revoke", studentId: studentForGuardian.id, membershipId: guardianA.id });
  const revokedFamilyMedia = await prisma.mediaAsset.findMany({ where: { tenantId: tenantA.id, id: { in: [familyMediaId!, familyRevisionId!, ...familyPageAssetIds] } }, select: { id: true, status: true } });
  const revocationCleanupCount = await prisma.storageOutbox.count({ where: { tenantId: tenantA.id, idempotencyKey: { in: [familyMediaId!, familyRevisionId!, ...familyPageAssetIds].map((id) => `media-delete:${id}`) }, status: "PENDING" } });
  const deniedAfterLinkRevocation = await fetch(`${base}/api/app/colegio-pilares-demo/midias/${familyMediaId}`, { headers: { cookie: familyCookieA } });
  if (revokedFamilyMedia.length !== 23 || revokedFamilyMedia.some((asset) => asset.status !== "WITHDRAWN") || revocationCleanupCount !== 23 || deniedAfterLinkRevocation.status !== 404) throw new Error("Revoking a family link did not withdraw that adult's media and cancel active access.");
  const [revokedA, preservedB] = await Promise.all([
    prisma.studentGuardian.findUniqueOrThrow({ where: { tenantId_studentId_membershipId: { tenantId: tenantA.id, studentId: studentForGuardian.id, membershipId: guardianA.id } }, select: { revokedAt: true } }),
    prisma.studentGuardian.findUniqueOrThrow({ where: { tenantId_studentId_membershipId: { tenantId: tenantA.id, studentId: studentForGuardian.id, membershipId: secondMembership.id } }, select: { approved: true, revokedAt: true } }),
  ]);
  if (!revokedA.revokedAt || !preservedB.approved || preservedB.revokedAt) throw new Error("Revoking one family membership changed the other guardian link.");
  const [afterA, afterB] = await Promise.all([
    fetch(`${base}/familia/colegio-pilares-demo`, { headers: { cookie: familyCookieA } }).then((response) => response.text()),
    fetch(`${base}/familia/colegio-pilares-demo`, { headers: { cookie: familyCookieB } }).then((response) => response.text()),
  ]);
  if (afterA.includes(firstStudentName) || !afterB.includes(firstStudentName) || afterB.includes("Lia Exemplo")) throw new Error("Family access did not remain isolated after revoking one guardian.");
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

  mediaId = `media_${suffix}`;
  const mediaFixture = await prisma.mediaAsset.create({ data: { id: mediaId, tenantId: tenantA.id, classroomId: classroom.id, uploadedByMembershipId: teacherA.id, title: `Revocation media ${suffix}`, category: "ACTIVITY", storageKey: `${tenantA.id}/${mediaId}`, originalFilename: "fixture.webp", contentType: "image/webp", byteSize: 3, checksumSha256: "0".repeat(64), scanStatus: "CLEAN", status: "PENDING" }, select: { id: true } });
  const mediaPageResponse = await fetch(`${base}/app/colegio-pilares-demo/midias`, { headers: { cookie } });
  const mediaPageHtml = await mediaPageResponse.text();
  if (mediaPageResponse.status !== 200 || !mediaPageHtml.includes("Arquivos privados da escola") || !mediaPageHtml.includes("Enviar para revisão privada")) throw new Error("The private media management screen did not render for the school administrator.");
  const authorizedMediaRequest = await fetch(`${base}/api/app/colegio-pilares-demo/midias/${mediaFixture.id}`, { headers: { cookie: teacherCookie } });
  if (![200, 503].includes(authorizedMediaRequest.status)) throw new Error(`Assigned teacher could not resolve their classroom media before revocation (${authorizedMediaRequest.status}).`);
  await prisma.mediaAsset.updateMany({ where: { tenantId: tenantA.id, id: mediaFixture.id }, data: { storageKey: `${tenantB.id}/${mediaFixture.id}` } });
  const adulteratedKeyRequest = await fetch(`${base}/api/app/colegio-pilares-demo/midias/${mediaFixture.id}`, { headers: { cookie: teacherCookie } });
  if (adulteratedKeyRequest.status !== 404) throw new Error("A media storage key with a different tenant prefix was served.");
  await prisma.mediaAsset.updateMany({ where: { tenantId: tenantA.id, id: mediaFixture.id }, data: { storageKey: `${tenantA.id}/${mediaFixture.id}` } });
  await prisma.classroomStaff.deleteMany({ where: { tenantId: tenantA.id, classroomId: classroom.id, membershipId: teacherA.id } });
  const revokedMediaRequest = await fetch(`${base}/api/app/colegio-pilares-demo/midias/${mediaFixture.id}`, { headers: { cookie: teacherCookie } });
  if (revokedMediaRequest.status !== 404) throw new Error(`Revoked classroom permission still exposed media (${revokedMediaRequest.status}).`);

  console.log(JSON.stringify({ managementScreen: "tenant-scoped configuration rendered", unitAndClassroom: "persisted in school A", capacity: "one active enrollment and one waitlisted", staffAssignment: "same-tenant teacher only", teacherResourceScope: "unassigned attendance and notices denied", mediaAuthorization: "foreign prefix, other guardian and revoked assignment denied", familyAlbum: "private to uploader, two server-paginated pages and filters remain tenant/class scoped", familyReview: "change request, versioned resubmission UI, approval without publication, revision history and consent withdrawal verified", familyDeletion: "private withdrawal immediately blocks download and queues tenant-scoped cleanup", teacherAdminRoutes: "calendar, CSV import, transfers, onboarding and invitations denied", crossTenantEnrollment: "attendance denied", guardianLink: "pending confirmation and independent guardian access with single-link revocation verified", crossTenantUnit: "denied", crossTenantStaff: "denied", crossTenantAdmin: "denied" }));
} finally {
  if (classroomId) {
    if (familyMediaId) {
      const familyAssetIds = [familyMediaId, ...(familyRevisionId ? [familyRevisionId] : []), ...familyPageAssetIds];
      const familySubmissionIds = [familySubmissionId, ...(familySubmissionId ? [`rsub_${suffix}`] : []), ...familyPageSubmissionIds].filter((id): id is string => Boolean(id));
      await prisma.storageOutbox.deleteMany({ where: { tenantId: tenantA.id, idempotencyKey: { in: familyAssetIds.map((id) => `media-delete:${id}`) } } });
      await prisma.mediaReviewEvent.deleteMany({ where: { tenantId: tenantA.id, submissionId: { in: familySubmissionIds } } });
      await prisma.mediaSubmission.updateMany({ where: { tenantId: tenantA.id, id: { in: familySubmissionIds } }, data: { supersedesId: null } });
      await prisma.mediaSubmission.deleteMany({ where: { tenantId: tenantA.id, id: { in: familySubmissionIds } } });
      await prisma.mediaConsent.deleteMany({ where: { tenantId: tenantA.id, mediaAssetId: { in: familyAssetIds } } });
      await prisma.mediaAsset.deleteMany({ where: { tenantId: tenantA.id, id: { in: familyAssetIds } } });
    }
    if (mediaId) await prisma.mediaAsset.deleteMany({ where: { tenantId: tenantA.id, id: mediaId } });
    await prisma.studentGuardian.deleteMany({ where: { tenantId: tenantA.id, student: { tenantId: tenantA.id, displayName: { in: createdStudentNames } } } });
    await prisma.enrollment.deleteMany({ where: { tenantId: tenantA.id, classroomId: classroomId } });
    await prisma.classroomStaff.deleteMany({ where: { tenantId: tenantA.id, classroomId: classroomId } });
    await prisma.student.deleteMany({ where: { tenantId: tenantA.id, displayName: { in: createdStudentNames } } });
    await prisma.classroom.deleteMany({ where: { tenantId: tenantA.id, id: classroomId, name: classroomName } });
  }
  if (unassignedClassroomId) await prisma.classroom.deleteMany({ where: { tenantId: tenantA.id, id: unassignedClassroomId, name: unassignedClassroomName } });
  if (unitId) await prisma.schoolUnit.deleteMany({ where: { tenantId: tenantA.id, id: unitId, name: unitName } });
  await prisma.session.deleteMany({ where: { tokenHash: { in: sessionTokenHashes } } });
  if (secondGuardianMembershipId) await prisma.membership.deleteMany({ where: { tenantId: tenantA.id, id: secondGuardianMembershipId } });
  if (secondGuardianUserId) await prisma.user.deleteMany({ where: { id: secondGuardianUserId, email: secondGuardianEmail } });
  await prisma.rateLimitBucket.deleteMany({ where: { keyHash: { in: testRateKeys } } });
  for (const bucket of previousRateBuckets) await prisma.rateLimitBucket.create({ data: bucket });
  await prisma.$disconnect();
}
