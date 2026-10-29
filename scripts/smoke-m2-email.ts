import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { createHmac, createHash, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { SMTPServer } from "smtp-server";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

loadEnvFile(existsSync(".env.local") ? ".env.local" : ".env");
if (process.env.NODE_ENV === "production") throw new Error("Email smoke is blocked in production.");
const rawUrl = process.env.DATABASE_URL;
const seedPassword = process.env.DEMO_SEED_PASSWORD;
if (!rawUrl || !seedPassword) throw new Error("Local DATABASE_URL and DEMO_SEED_PASSWORD are required.");
const dbUrl = new URL(rawUrl);
const database = decodeURIComponent(dbUrl.pathname.replace(/^\//, ""));
if (dbUrl.protocol !== "mysql:" || !["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) || !/(?:_dev|_test)$/.test(database)) {
  throw new Error("Email smoke requires a loopback *_dev or *_test database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: dbUrl.hostname,
    port: Number(dbUrl.port || 3306),
    user: decodeURIComponent(dbUrl.username),
    password: decodeURIComponent(dbUrl.password),
    database,
    connectionLimit: 3,
  }),
});
const messages: { envelope: { rcptTo: { address: string }[] }; data: string }[] = [];
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["AUTH", "STARTTLS"],
  onConnect(session, callback) {
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(session.remoteAddress)) return callback(new Error("Loopback only."));
    callback();
  },
  onData(stream, session, callback) {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", () => callback(new Error("SMTP capture failed.")));
    stream.on("end", () => {
      messages.push({ envelope: session.envelope, data: Buffer.concat(chunks).toString("utf8") });
      callback(null, "Captured locally.");
    });
  },
});

let webProcess: ChildProcess | undefined;
let userId;
let invitationId;
let adminSessionTokenHash;
let inviteCreateKey;
let previousInviteCreateBucket;
const rateKeys = [];
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const email = `smtp-capture-${suffix}@turminha.local`;
const displayName = "Responsável SMTP local";
const password = "LocalEmailSmokePassword!2032";
const rateSecret = process.env.RATE_LIMIT_SECRET ?? "turminha-local-rate-limit-secret-only";
const rateKey = (scope: string, identity: string) => createHmac("sha256", rateSecret).update(`${scope}\0${identity}`).digest("hex");
const adminSigninKey = rateKey("signin", "admin.demo@turminha.local");
const previousAdminSigninBucket = await prisma.rateLimitBucket.findUnique({ where: { keyHash: adminSigninKey } });
rateKeys.push(adminSigninKey);

async function freePort() {
  const server = createServer();
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") reject(new Error("Unable to allocate a local port."));
      else resolve((address as AddressInfo).port);
    });
  });
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForApp(url: string) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (!webProcess || webProcess.exitCode !== null) throw new Error(`Local Next server exited with code ${webProcess?.exitCode ?? "unknown"}.`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {}
    await delay(400);
  }
  throw new Error("Local Next server did not become ready within 60 seconds.");
}

function stopWebProcess() {
  if (!webProcess || webProcess.exitCode !== null) return;
  if (process.platform === "win32" && webProcess.pid) {
    spawnSync("taskkill.exe", ["/PID", String(webProcess.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    webProcess.kill("SIGTERM");
  }
}

try {
  const smtpPort = await new Promise<number>((resolve, reject) => {
    smtp.once("error", reject);
    smtp.listen(0, "127.0.0.1", () => {
      const address = smtp.server.address();
      if (!address || typeof address === "string") reject(new Error("Unable to allocate the local SMTP port."));
      else resolve((address as AddressInfo).port);
    });
  });
  const webPort = await freePort();
  const base = `http://localhost:${webPort}`;
  const webEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
    APP_BASE_URL: base,
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtpPort),
    SMTP_FROM: "Turminha <no-reply@turminha.local>",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
  };
  webProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(webPort)], {
    cwd: process.cwd(),
    env: webEnv,
    stdio: "ignore",
    windowsHide: true,
  });
  await waitForApp(`${base}/entrar`);

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "colegio-pilares-demo" }, select: { id: true } });
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin.demo@turminha.local" }, select: { id: true } });
  const membership = await prisma.membership.findUniqueOrThrow({ where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } }, select: { id: true } });
  inviteCreateKey = rateKey("invite-create", `${tenant.id}:${membership.id}`);
  previousInviteCreateBucket = await prisma.rateLimitBucket.findUnique({ where: { keyHash: inviteCreateKey } });
  rateKeys.push(inviteCreateKey);
  const student = await prisma.student.findFirstOrThrow({ where: { tenantId: tenant.id, enrollments: { some: { status: "ACTIVE", validUntil: null } } }, select: { id: true } });
  const login = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: base, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: "admin.demo@turminha.local", password: seedPassword, tenant: "colegio-pilares-demo" }),
  });
  const sessionCookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  if (login.status !== 303 || !sessionCookie) throw new Error(`Local admin sign-in failed (${login.status}, ${await login.text()}).`);
  adminSessionTokenHash = createHash("sha256").update(sessionCookie.slice(sessionCookie.indexOf("=") + 1)).digest("hex");

  const inviteResponse = await fetch(`${base}/api/app/colegio-pilares-demo/convites`, {
    method: "POST",
    headers: { origin: base, cookie: sessionCookie, "content-type": "application/json" },
    body: JSON.stringify({ role: "GUARDIAN", email, displayName, studentId: student.id, classroomId: null }),
  });
  const invite = await inviteResponse.json() as { invitationUrl?: string };
  if (inviteResponse.status !== 201 || !invite.invitationUrl) throw new Error(`Local test invitation failed (${inviteResponse.status}).`);
  const inviteToken = new URL(invite.invitationUrl, base).pathname.split("/").at(-1);
  if (!inviteToken) throw new Error("Local test invite URL did not include a token.");
  const inviteHash = createHash("sha256").update(inviteToken).digest("hex");
  rateKeys.push(rateKey("invite-accept", inviteHash), rateKey("email-verification-send", email.toLowerCase()));
  invitationId = (await prisma.invitation.findUniqueOrThrow({ where: { tokenHash: inviteHash }, select: { id: true } })).id;

  const accepted = await fetch(`${base}/api/invitations/accept`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: base, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: inviteToken, displayName, password }),
  });
  if (accepted.status !== 303 || !accepted.headers.get("location")?.includes("email=sent") || accepted.headers.get("set-cookie")) {
    throw new Error(`Invite acceptance did not report a pending emailed confirmation (${accepted.status}).`);
  }
  for (let retry = 0; retry < 2; retry++) {
    const retryAccepted = await fetch(`${base}/api/invitations/accept`, {
      method: "POST",
      redirect: "manual",
      headers: { origin: base, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: inviteToken, displayName, password }),
    });
    if (retryAccepted.status !== 303 || !retryAccepted.headers.get("location")?.includes("email=sent") || retryAccepted.headers.get("set-cookie")) {
      throw new Error(`Resend did not report a pending emailed confirmation (${retryAccepted.status}).`);
    }
  }
  if (messages.length !== 3) throw new Error(`Expected three local SMTP messages after two resends; captured ${messages.length}.`);
  const rateLimitedSend = await fetch(`${base}/api/invitations/accept`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: base, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: inviteToken, displayName, password }),
  });
  if (!rateLimitedSend.headers.get("location")?.includes("email=rate-limit") || rateLimitedSend.headers.get("set-cookie") || messages.length !== 3) {
    throw new Error("Email confirmation send rate limit failed to stop additional local messages.");
  }
  const verificationTokens = messages.map((message) => {
    if (message.envelope.rcptTo.length !== 1 || message.envelope.rcptTo[0].address.toLowerCase() !== email.toLowerCase()) {
      throw new Error("Captured SMTP recipient did not match the invitation address.");
    }
    const decodedLineBreaks = message.data.replace(/=\r?\n/g, "");
    if (!decodedLineBreaks.includes("Confirme") || !decodedLineBreaks.includes("24 horas")) throw new Error("Captured SMTP message is missing confirmation content or expiry guidance.");
    const verificationUrl = decodedLineBreaks.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/verificar-email\/([A-Za-z0-9_-]{32,128})/);
    if (!verificationUrl?.[1]) throw new Error("Captured SMTP message did not contain a local verification URL.");
    return verificationUrl[1];
  });
  if (new Set(verificationTokens).size !== 3) throw new Error("Resent confirmation messages reused a verification token.");
  const verificationHashes = verificationTokens.map((token) => createHash("sha256").update(token).digest("hex"));
  rateKeys.push(...verificationHashes.map((hash) => rateKey("email-verification-complete", hash)));
  const pending = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true, emailVerifiedAt: true, emailVerifications: { where: { tokenHash: { in: verificationHashes } }, select: { id: true, tokenHash: true } }, memberships: { where: { tenantId: tenant.id }, select: { id: true } } } });
  userId = pending.id;
  if (pending.emailVerifiedAt || pending.memberships.length || pending.emailVerifications.length !== 3) throw new Error("Mail delivery prematurely activated the invited account or discarded a valid resend challenge.");

  const expiredToken = verificationTokens[2]!;
  const expiredHash = verificationHashes[2]!;
  await prisma.emailVerification.update({ where: { tokenHash: expiredHash }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  for (let attempt = 0; attempt < 10; attempt++) {
    const expired = await fetch(`${base}/api/invitations/verify`, {
      method: "POST",
      redirect: "manual",
      headers: { origin: base, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: expiredToken }),
    });
    if (expired.headers.get("set-cookie")) throw new Error("Expired verification challenge established a session.");
  }
  const limitedConfirmation = await fetch(`${base}/api/invitations/verify`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: base, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: expiredToken }),
  });
  const stillPending = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { emailVerifiedAt: true, memberships: { where: { tenantId: tenant.id }, select: { id: true } } } });
  if (limitedConfirmation.headers.get("set-cookie") || stillPending.emailVerifiedAt || stillPending.memberships.length) throw new Error("Verification completion limit allowed or activated an expired challenge.");

  const revokedToken = verificationTokens[1]!;
  await prisma.invitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } });
  const revokedConfirmation = await fetch(`${base}/api/invitations/verify`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: base, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: revokedToken }),
  });
  if (revokedConfirmation.headers.get("set-cookie")) throw new Error("Mailbox confirmation bypassed a revoked invitation.");
  await prisma.invitation.update({ where: { id: invitationId }, data: { revokedAt: null } });

  const verificationToken = verificationTokens[0]!;
  const winnerKey = rateKey("email-verification-complete", verificationHashes[0]!);
  await prisma.rateLimitBucket.create({ data: { keyHash: winnerKey, windowStartedAt: new Date(), attempts: 0 } });
  const concurrentConfirmations = await Promise.all([0, 1].map(() => fetch(`${base}/api/invitations/verify`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: base, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: verificationToken }),
  })));
  const successfulConfirmations = concurrentConfirmations.filter((response) => response.headers.get("set-cookie") && response.headers.get("location")?.includes("/familia/colegio-pilares-demo"));
  if (successfulConfirmations.length !== 1) {
    throw new Error(`Concurrent confirmation created ${successfulConfirmations.length} sessions; exactly one is required.`);
  }
  const activated = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { emailVerifiedAt: true, memberships: { where: { tenantId: tenant.id }, select: { guardianLinks: { where: { studentId: student.id }, select: { approved: true } } } } } });
  if (!activated.emailVerifiedAt || !activated.memberships[0]?.guardianLinks.some((link) => link.approved)) throw new Error("Confirmed account did not persist its approved guardian relationship.");
  if (await prisma.session.count({ where: { userId } }) !== 1) throw new Error("Concurrent confirmation did not result in exactly one user session.");
  for (const staleToken of verificationTokens.slice(1)) {
    const staleResend = await fetch(`${base}/api/invitations/verify`, {
      method: "POST",
      redirect: "manual",
      headers: { origin: base, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: staleToken }),
    });
    if (staleResend.headers.get("set-cookie")) throw new Error("A second email confirmation challenge remained reusable after account activation.");
  }

  console.log(JSON.stringify({ smtp: "three messages captured by loopback-only SMTP sink", recipient: "invited address matched", resend: "fresh independent tokens persisted and capped at three sends", confirmation: "expired/revoked challenges and completion throttling denied; simultaneous use created exactly one session, and unused tokens were removed", externalDelivery: false }));
} finally {
  stopWebProcess();
  await new Promise<void>((resolve) => smtp.close(() => resolve()));
  if (adminSessionTokenHash) await prisma.session.deleteMany({ where: { tokenHash: adminSessionTokenHash } });
  if (userId) {
    await prisma.session.deleteMany({ where: { userId } });
    const memberships = await prisma.membership.findMany({ where: { userId, tenantId: (await prisma.tenant.findUnique({ where: { slug: "colegio-pilares-demo" }, select: { id: true } }))?.id }, select: { id: true } });
    const membershipIds = memberships.map((membership) => membership.id);
    await prisma.studentGuardian.deleteMany({ where: { membershipId: { in: membershipIds } } });
    await prisma.classroomStaff.deleteMany({ where: { membershipId: { in: membershipIds } } });
    await prisma.membership.deleteMany({ where: { id: { in: membershipIds } } });
    await prisma.user.deleteMany({ where: { id: userId, email } });
  } else {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) await prisma.user.deleteMany({ where: { id: user.id, email } });
  }
  if (invitationId) await prisma.invitation.deleteMany({ where: { id: invitationId } });
  if (rateKeys.length) await prisma.rateLimitBucket.deleteMany({ where: { keyHash: { in: rateKeys } } });
  if (previousAdminSigninBucket) await prisma.rateLimitBucket.create({ data: previousAdminSigninBucket });
  if (previousInviteCreateBucket) await prisma.rateLimitBucket.create({ data: previousInviteCreateBucket });
  await prisma.$disconnect();
}
