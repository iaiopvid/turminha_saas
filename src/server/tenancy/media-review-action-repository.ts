import "server-only";
import { MediaConsentPurpose, MediaSubmissionStatus, MembershipRole, Prisma } from "@/generated/prisma/client";
import type { TenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";

const reviewableStatuses = [MediaSubmissionStatus.SUBMITTED, MediaSubmissionStatus.UNDER_REVIEW];

export async function reviewMediaSubmission(context: TenantContext, submissionId: string, decision: MediaSubmissionStatus, comment: string | null = null) {
  const scope: Prisma.MediaSubmissionWhereInput = {
    id: submissionId,
    tenantId: context.tenantId,
    status: { in: reviewableStatuses },
    mediaAsset: {
      status: "PRIVATE",
      scanStatus: "CLEAN",
      consents: { some: { tenantId: context.tenantId, purpose: MediaConsentPurpose.SCHOOL_REVIEW, revokedAt: null } },
    },
    student: {
      enrollments: {
        some: {
          tenantId: context.tenantId,
          status: "ACTIVE",
          classroom: {
            ...(context.role === MembershipRole.TEACHER || context.role === MembershipRole.ASSISTANT
              ? { staff: { some: { tenantId: context.tenantId, membershipId: context.membershipId } } }
              : {}),
          },
        },
      },
    },
    submittedBy: { guardianLinks: { some: { tenantId: context.tenantId, approved: true, revokedAt: null, membership: { role: MembershipRole.GUARDIAN, status: "ACTIVE" } } } },
  };

  return prisma.$transaction(async (tx) => {
    const submission = await tx.mediaSubmission.findFirst({ where: scope, select: { id: true, status: true } });
    if (!submission) return { ok: false as const, reason: "Indisponível, fora do escopo ou já decidido." };
    const reviewedAt = decision === MediaSubmissionStatus.UNDER_REVIEW ? null : new Date();
    const changed = await tx.mediaSubmission.updateMany({
      where: { ...scope, id: submission.id },
      data: { status: decision, reviewerMembershipId: context.membershipId, reviewComment: comment, reviewedAt },
    });
    if (changed.count !== 1) return { ok: false as const, reason: "O envio mudou durante a revisão; atualize a fila." };
    await tx.mediaReviewEvent.create({
      data: { tenantId: context.tenantId, submissionId: submission.id, actorMembershipId: context.membershipId, actorDisplayName: context.displayName, actorRole: context.role, fromStatus: submission.status, toStatus: decision, comment },
    });
    return { ok: true as const };
  });
}
