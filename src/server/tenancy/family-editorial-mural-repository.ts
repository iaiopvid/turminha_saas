import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { MembershipRole, Prisma } from "@/generated/prisma/client";
import type { TenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const PAGE_SIZE = 12;
const SCAN_SIZE = 48;
const CURSOR_VERSION = "editorial-mural-v1";

type MuralCursor = {
  version: string;
  tenantId: string;
  membershipId: string;
  studentId: string | null;
  snapshotAt: string;
  afterAt: string;
  afterId: string;
};

function cursorSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "development") return "turminha-local-editorial-mural-cursor-secret";
  throw new Error("SESSION_SECRET deve ter pelo menos 32 caracteres para assinar cursores do mural.");
}

function sign(payload: string) {
  return createHmac("sha256", cursorSecret()).update(payload).digest("base64url");
}

function encodeCursor(cursor: MuralCursor) {
  const payload = Buffer.from(JSON.stringify(cursor)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function parseCursor(value: string | undefined, context: TenantContext, studentId: string | null): MuralCursor | null | false {
  if (!value) return null;
  if (value.length > 1200) return false;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined) return false;
  let expected: Buffer;
  let actual: Buffer;
  try { expected = Buffer.from(sign(payload), "base64url"); actual = Buffer.from(signature, "base64url"); }
  catch { return false; }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<MuralCursor>;
    if (decoded.version !== CURSOR_VERSION || decoded.tenantId !== context.tenantId || decoded.membershipId !== context.membershipId || decoded.studentId !== studentId) return false;
    if (typeof decoded.snapshotAt !== "string" || !Number.isFinite(Date.parse(decoded.snapshotAt)) || typeof decoded.afterAt !== "string" || !Number.isFinite(Date.parse(decoded.afterAt)) || typeof decoded.afterId !== "string" || decoded.afterId.length > 30) return false;
    return decoded as MuralCursor;
  } catch { return false; }
}

type MuralItem = { publicationId: string; assetId: string; title: string; studentName: string; publishedAt: string };

export async function getFamilyEditorialMural(context: TenantContext, cursorValue: string | undefined, requestedStudentId?: string | null) {
  if (context.role !== MembershipRole.GUARDIAN) return null;
  const studentId = requestedStudentId || null;
  if (studentId && !/^[A-Za-z0-9_-]{1,30}$/.test(studentId)) return { items: [] as MuralItem[], nextCursor: null, hasMore: false, invalidCursor: false, invalidFilter: true };
  const parsedCursor = parseCursor(cursorValue, context, studentId);
  if (parsedCursor === false) return { items: [] as MuralItem[], nextCursor: null, hasMore: false, invalidCursor: true, invalidFilter: false };

  const ownLinks = await prisma.studentGuardian.findMany({
    where: { tenantId: context.tenantId, membershipId: context.membershipId, approved: true, revokedAt: null, membership: { role: MembershipRole.GUARDIAN, status: "ACTIVE" } },
    select: { studentId: true },
  });
  const ownStudentIds = [...new Set(ownLinks.map((link) => link.studentId))];
  const studentIds = studentId ? (ownStudentIds.includes(studentId) ? [studentId] : []) : ownStudentIds;
  if (!studentIds.length) return { items: [] as MuralItem[], nextCursor: null, hasMore: false, invalidCursor: false, invalidFilter: Boolean(studentId) };

  const activeLinks = await prisma.studentGuardian.findMany({
    where: { tenantId: context.tenantId, studentId: { in: studentIds }, approved: true, revokedAt: null, membership: { role: MembershipRole.GUARDIAN, status: "ACTIVE" } },
    select: { studentId: true, membershipId: true },
  });
  const membershipsByStudent = new Map<string, string[]>();
  for (const link of activeLinks) membershipsByStudent.set(link.studentId, [...(membershipsByStudent.get(link.studentId) ?? []), link.membershipId]);
  const fullyConsentedStudents = [...membershipsByStudent.entries()]
    .filter(([, memberships]) => memberships.length > 0)
    .map(([linkedStudentId, memberships]) => ({ studentId: linkedStudentId, AND: memberships.map((membershipId) => ({ consents: { some: { tenantId: context.tenantId, membershipId, grantedAt: { not: null }, revokedAt: null } } })) }));
  if (!fullyConsentedStudents.length) return { items: [] as MuralItem[], nextCursor: null, hasMore: false, invalidCursor: false, invalidFilter: false };

  const snapshotAt = parsedCursor ? new Date(parsedCursor.snapshotAt) : new Date();
  let after: { at: Date; id: string } | null = parsedCursor ? { at: new Date(parsedCursor.afterAt), id: parsedCursor.afterId } : null;
  let exhausted = false;
  const visible: MuralItem[] = [];
  while (visible.length < PAGE_SIZE + 1 && !exhausted) {
    const where: Prisma.MediaPublicationWhereInput = {
      tenantId: context.tenantId,
      status: "PUBLISHED",
      studentId: { in: studentIds },
      createdAt: { lte: snapshotAt },
      mediaAsset: { status: "PRIVATE", scanStatus: "CLEAN", storageKey: { not: null } },
      student: { guardians: { some: { tenantId: context.tenantId, membershipId: context.membershipId, approved: true, revokedAt: null, membership: { role: MembershipRole.GUARDIAN, status: "ACTIVE" } } } },
      OR: fullyConsentedStudents,
      ...(after ? { AND: [{ OR: [{ createdAt: { lt: after.at } }, { createdAt: after.at, id: { lt: after.id } }] }] } : {}),
    };
    const candidates = await prisma.mediaPublication.findMany({
      where,
      select: { id: true, createdAt: true, studentId: true, student: { select: { displayName: true } }, mediaAsset: { select: { id: true, title: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: SCAN_SIZE,
    });
    if (!candidates.length) { exhausted = true; break; }
    const lastCandidate = candidates[candidates.length - 1]!;
    after = { at: lastCandidate.createdAt, id: lastCandidate.id };
    exhausted = candidates.length < SCAN_SIZE;

    // Re-read current guardians and grants after selecting the page. This closes the gap
    // between the initial guardian query and presentation if a family link changed.
    const candidateStudentIds = [...new Set(candidates.map((item) => item.studentId))];
    const currentLinks = await prisma.studentGuardian.findMany({
      where: { tenantId: context.tenantId, studentId: { in: candidateStudentIds }, approved: true, revokedAt: null, membership: { role: MembershipRole.GUARDIAN, status: "ACTIVE" } },
      select: { studentId: true, membershipId: true },
    });
    const currentByStudent = new Map<string, string[]>();
    for (const link of currentLinks) currentByStudent.set(link.studentId, [...(currentByStudent.get(link.studentId) ?? []), link.membershipId]);
    const currentMembershipIds = [...new Set(currentLinks.map((link) => link.membershipId))];
    const grants = currentMembershipIds.length ? await prisma.mediaPublicationConsent.findMany({
      where: { tenantId: context.tenantId, publicationId: { in: candidates.map((item) => item.id) }, membershipId: { in: currentMembershipIds }, grantedAt: { not: null }, revokedAt: null },
      select: { publicationId: true, membershipId: true },
    }) : [];
    const grantedByPublication = new Map<string, Set<string>>();
    for (const grant of grants) {
      const set = grantedByPublication.get(grant.publicationId) ?? new Set<string>();
      set.add(grant.membershipId);
      grantedByPublication.set(grant.publicationId, set);
    }
    for (const candidate of candidates) {
      const guardians = currentByStudent.get(candidate.studentId) ?? [];
      const granted = grantedByPublication.get(candidate.id) ?? new Set<string>();
      if (!guardians.includes(context.membershipId) || !guardians.length || !guardians.every((membershipId) => granted.has(membershipId))) continue;
      visible.push({ publicationId: candidate.id, assetId: candidate.mediaAsset.id, title: candidate.mediaAsset.title, studentName: candidate.student.displayName, publishedAt: candidate.createdAt.toISOString() });
      if (visible.length === PAGE_SIZE + 1) break;
    }
  }

  const hasMore = visible.length > PAGE_SIZE || !exhausted;
  const items = visible.slice(0, PAGE_SIZE);
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ version: CURSOR_VERSION, tenantId: context.tenantId, membershipId: context.membershipId, studentId, snapshotAt: snapshotAt.toISOString(), afterAt: last.publishedAt, afterId: last.publicationId }) : null;
  return { items, nextCursor, hasMore: Boolean(nextCursor), invalidCursor: false, invalidFilter: false };
}
