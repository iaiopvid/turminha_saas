import "server-only";
import { createHmac } from "node:crypto";
import { prisma } from "@/server/db/prisma";

type RateLimitPolicy = { limit: number; windowMs: number };
let lastPruneAt = 0;

function digest(scope: string, identity: string) {
  const secret = process.env.RATE_LIMIT_SECRET ?? (process.env.NODE_ENV === "development" ? "turminha-local-rate-limit-secret-only" : "");
  if (secret.length < 32) throw new Error("RATE_LIMIT_SECRET deve ter pelo menos 32 caracteres fora de development.");
  return createHmac("sha256", secret).update(`${scope}\0${identity}`).digest("hex");
}

export async function consumeRateLimit(scope: string, identity: string, policy: RateLimitPolicy) {
  const now = new Date();
  const keyHash = digest(scope, identity);
  const windowStartedAt = new Date(now.getTime() - policy.windowMs);
  await prisma.rateLimitBucket.updateMany({ where: { keyHash, windowStartedAt: { lt: windowStartedAt } }, data: { windowStartedAt: now, attempts: 0 } });
  const bucket = await prisma.rateLimitBucket.upsert({
    where: { keyHash },
    create: { keyHash, windowStartedAt: now, attempts: 1 },
    update: { attempts: { increment: 1 } },
    select: { attempts: true, windowStartedAt: true },
  });
  if (now.getTime() - lastPruneAt > 15 * 60 * 1000) {
    lastPruneAt = now.getTime();
    void prisma.rateLimitBucket.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }).catch(() => undefined);
  }
  return {
    allowed: bucket.attempts <= policy.limit,
    remaining: Math.max(0, policy.limit - bucket.attempts),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStartedAt.getTime() + policy.windowMs - now.getTime()) / 1000)),
  };
}
