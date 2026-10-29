import "server-only";
import type { TenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const PAGE_SIZE = 12;

export async function getFamilyMemories(context: TenantContext, requestedPage: number) {
  if (context.role !== "GUARDIAN") return null;
  const page = Number.isSafeInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
  const visibleLink = { tenantId: context.tenantId, membershipId: context.membershipId, approved: true, revokedAt: null };
  const where = {
    tenantId: context.tenantId,
    uploadedByMembershipId: context.membershipId,
    studentId: { not: null },
    status: { notIn: ["WITHDRAWN", "REJECTED"] },
    consents: { some: { tenantId: context.tenantId, membershipId: context.membershipId, purpose: "PRIVATE_STORAGE" as const, revokedAt: null } },
    student: { guardians: { some: visibleLink } },
  };
  const total = await prisma.mediaAsset.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const items = await prisma.mediaAsset.findMany({
      where,
      select: {
        id: true, title: true, category: true, status: true, scanStatus: true, createdAt: true,
        student: { select: { id: true, displayName: true } },
        consents: { where: { tenantId: context.tenantId, membershipId: context.membershipId, purpose: "SCHOOL_REVIEW", revokedAt: null }, select: { id: true }, take: 1 },
        submissions: { where: { tenantId: context.tenantId, submittedByMembershipId: context.membershipId }, select: { id: true, status: true, version: true, reviewComment: true, supersedesId: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
  return { page: currentPage, pageCount, total, items };
}

export async function getFamilyPublications(context: TenantContext, requestedPublishedPage: number, requestedRequestPage: number) {
  if (context.role !== "GUARDIAN") return null;
  const guardian = { tenantId: context.tenantId, membershipId: context.membershipId, approved: true, revokedAt: null, membership: { role: "GUARDIAN" as const, status: "ACTIVE" as const } };
  const linkedStudents = await prisma.studentGuardian.findMany({ where: guardian, select: { studentId: true } });
  const studentIds = linkedStudents.map(({ studentId }) => studentId);
  const pageNumber = (requested: number) => Number.isSafeInteger(requested) ? Math.max(1, requested) : 1;
  const emptyPage = { page: 1, pageCount: 1, total: 0, items: [] };
  if (!studentIds.length) return { requests: emptyPage, published: emptyPage };
  const activeGuardians = await prisma.studentGuardian.findMany({ where: { tenantId: context.tenantId, studentId: { in: studentIds }, approved: true, revokedAt: null, membership: { role: "GUARDIAN", status: "ACTIVE" } }, select: { studentId: true, membershipId: true } });
  const guardiansByStudent = new Map<string, string[]>();
  for (const link of activeGuardians) guardiansByStudent.set(link.studentId, [...(guardiansByStudent.get(link.studentId) ?? []), link.membershipId]);
  const fullyConsentedStudents = [...guardiansByStudent.entries()].filter(([, memberships]) => memberships.length > 0).map(([studentId, memberships]) => ({ studentId, AND: memberships.map((membershipId) => ({ consents: { some: { tenantId: context.tenantId, membershipId, grantedAt: { not: null }, revokedAt: null } } })) }));
  const publishedWhere = {
    tenantId: context.tenantId,
    status: "PUBLISHED" as const,
    mediaAsset: { status: "PRIVATE", scanStatus: "CLEAN" },
    student: { guardians: { some: guardian } },
    OR: fullyConsentedStudents,
  };
  const requestWhere = { tenantId: context.tenantId, studentId: { in: studentIds }, status: "AWAITING_CONSENT" as const, consents: { some: { tenantId: context.tenantId, membershipId: context.membershipId, grantedAt: null, revokedAt: null } } };
  const [publishedTotal, requestTotal] = await Promise.all([prisma.mediaPublication.count({ where: publishedWhere }), prisma.mediaPublication.count({ where: requestWhere })]);
  const publishedPageCount = Math.max(1, Math.ceil(publishedTotal / PAGE_SIZE));
  const requestPageCount = Math.max(1, Math.ceil(requestTotal / PAGE_SIZE));
  const publishedPage = Math.min(pageNumber(requestedPublishedPage), publishedPageCount);
  const requestPage = Math.min(pageNumber(requestedRequestPage), requestPageCount);
  const [publishedItems, requestItems] = await Promise.all([
    prisma.mediaPublication.findMany({
      where: publishedWhere,
      select: { id: true, createdAt: true, student: { select: { displayName: true } }, mediaAsset: { select: { id: true, title: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (publishedPage - 1) * PAGE_SIZE, take: PAGE_SIZE,
    }),
    prisma.mediaPublication.findMany({
      where: requestWhere,
      select: { id: true, createdAt: true, student: { select: { displayName: true } }, mediaAsset: { select: { id: true, title: true } }, consents: { where: { tenantId: context.tenantId, membershipId: context.membershipId }, select: { grantedAt: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (requestPage - 1) * PAGE_SIZE, take: PAGE_SIZE,
    }),
  ]);
  return {
    published: { page: publishedPage, pageCount: publishedPageCount, total: publishedTotal, items: publishedItems },
    requests: { page: requestPage, pageCount: requestPageCount, total: requestTotal, items: requestItems },
  };
}
