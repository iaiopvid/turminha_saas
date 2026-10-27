import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error("DATABASE_URL is required for server-side database access.");
const url = new URL(rawUrl);

const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  connectionLimit: Number(url.searchParams.get("connection_limit") ?? "5"),
});

const globalForPrisma = globalThis as typeof globalThis & { turminhaPrisma?: PrismaClient };
export const prisma = globalForPrisma.turminhaPrisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.turminhaPrisma = prisma;
