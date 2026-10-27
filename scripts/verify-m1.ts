import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client.js";

loadEnvFile(existsSync(".env.local") ? ".env.local" : ".env");
const url = new URL(process.env.DATABASE_URL ?? "");
const database = url.pathname.replace(/^\//, "");
if (url.protocol !== "mysql:" || !["localhost", "127.0.0.1", "::1"].includes(url.hostname) || !/(?:_dev|_test)$/.test(database)) throw new Error("M1 verification is restricted to a loopback development/test database.");

const prisma = new PrismaClient({ adapter: new PrismaMariaDb({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database, connectionLimit: 2 }) });
try {
  const [selected] = await prisma.$queryRaw<Array<{ databaseName: string; serverVersion: string }>>`SELECT DATABASE() AS databaseName, VERSION() AS serverVersion`;
  const tenants = await prisma.tenant.findMany({ where: { slug: { in: ["colegio-pilares-demo", "escola-jardim-demo"] } }, select: { id: true, slug: true } });
  if (selected.databaseName !== database || tenants.length !== 2) throw new Error("Expected two demo tenants in the same configured database.");
  const counts = await Promise.all(tenants.map(async ({ id, slug }) => ({ slug, students: await prisma.student.count({ where: { tenantId: id } }), classrooms: await prisma.classroom.count({ where: { tenantId: id } }), memberships: await prisma.membership.count({ where: { tenantId: id } }) })));
  const studentCounts = new Map(counts.map((count) => [count.slug, count.students]));
  if (studentCounts.get("colegio-pilares-demo") !== 3 || studentCounts.get("escola-jardim-demo") !== 2) throw new Error("Demo tenant record counts do not match the seed.");

  const [tenantA] = tenants.filter((tenant) => tenant.slug === "colegio-pilares-demo");
  const [tenantB] = tenants.filter((tenant) => tenant.slug === "escola-jardim-demo");
  const studentA = await prisma.student.findFirstOrThrow({ where: { tenantId: tenantA.id } });
  const classB = await prisma.classroom.findFirstOrThrow({ where: { tenantId: tenantB.id } });
  let crossTenantLinkRejected = false;
  const probeId = `probe-${randomBytes(8).toString("hex")}`;
  try {
    await prisma.$executeRaw`INSERT INTO enrollments (id, tenantId, studentId, classroomId, status, validFrom) VALUES (${probeId}, ${tenantA.id}, ${studentA.id}, ${classB.id}, 'ACTIVE', CURRENT_DATE())`;
  } catch { crossTenantLinkRejected = true; }
  if (!crossTenantLinkRejected) {
    await prisma.enrollment.deleteMany({ where: { id: probeId, tenantId: tenantA.id } });
    throw new Error("Composite foreign key accepted a cross-tenant enrollment.");
  }

  const engines = await prisma.$queryRaw<Array<{ name: string; engine: string | null }>>`SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = ${database} ORDER BY TABLE_NAME`;
  if (engines.some((table) => table.engine !== "InnoDB")) throw new Error("A business table is not InnoDB.");
  console.log(JSON.stringify({ sameDatabase: selected.databaseName, serverVersion: selected.serverVersion, tablesInSharedSchema: engines.length, enginesVerified: engines.every((table) => table.engine === "InnoDB"), tenants: counts, crossTenantCompositeForeignKeyRejected: crossTenantLinkRejected }));
} finally { await prisma.$disconnect(); }
