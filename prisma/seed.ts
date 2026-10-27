import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { hash } from "bcryptjs";
import { AttendanceStatus, EnrollmentStatus, MembershipRole, NoticeVisibility, PrismaClient, TenantStatus } from "../src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

loadEnvFile(existsSync(".env.local") ? ".env.local" : ".env");
const rawUrl = process.env.DATABASE_URL;
const databaseUrl = rawUrl ? new URL(rawUrl) : null;
const database = databaseUrl?.pathname.replace(/^\//, "");
if (process.env.NODE_ENV === "production" || !["development", "test"].includes(process.env.NODE_ENV ?? "development") || process.env.DEMO_SEED !== "true") {
  throw new Error("Demo seed blocked. Set DEMO_SEED=true only in development/test.");
}
if (!databaseUrl || databaseUrl.protocol !== "mysql:" || !["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) || !/(?:_dev|_test)$/.test(database ?? "")) {
  throw new Error("Demo seed requires a loopback database whose name ends with _dev or _test.");
}
const password = process.env.DEMO_SEED_PASSWORD;
if (!password || password.length < 12) throw new Error("Set a local DEMO_SEED_PASSWORD with at least 12 characters.");

const adapter = new PrismaMariaDb({ host: databaseUrl.hostname, port: Number(databaseUrl.port || 3306), user: decodeURIComponent(databaseUrl.username), password: decodeURIComponent(databaseUrl.password), database: database!, connectionLimit: 2 });
const prisma = new PrismaClient({ adapter });
const passwordHash = await hash(password, 12);

async function seedSchool(input: {
  tenantId: string; slug: string; schoolId: string; schoolName: string; displayClass: string; displayTeam: string;
  classroomId: string; classroomName: string; year: number; noticeId: string; noticeTitle: string; noticeBody: string;
  students: Array<{ id: string; name: string }>; familyEmail: string; familyName: string; familyStudentIndex: number;
}) {
  const tenant = await prisma.tenant.upsert({ where: { slug: input.slug }, update: { status: TenantStatus.ACTIVE }, create: { id: input.tenantId, slug: input.slug, status: TenantStatus.ACTIVE } });
  await prisma.school.upsert({ where: { tenantId: tenant.id }, update: { name: input.schoolName, displayClass: input.displayClass, displayTeam: input.displayTeam, timezone: "America/Sao_Paulo", publicStudents: false }, create: { id: input.schoolId, tenantId: tenant.id, name: input.schoolName, displayClass: input.displayClass, displayTeam: input.displayTeam, timezone: "America/Sao_Paulo", publicStudents: false } });
  const unit = await prisma.schoolUnit.upsert({ where: { tenantId_name: { tenantId: tenant.id, name: "Unidade Principal" } }, update: { active: true }, create: { id: `unit-${tenant.id}`, tenantId: tenant.id, name: "Unidade Principal" } });
  const classroom = await prisma.classroom.upsert({ where: { tenantId_schoolYear_name: { tenantId: tenant.id, schoolYear: input.year, name: input.classroomName } }, update: { status: EnrollmentStatus.ACTIVE, unitId: unit.id }, create: { id: input.classroomId, tenantId: tenant.id, unitId: unit.id, name: input.classroomName, schoolYear: input.year } });
  const teacher = await prisma.membership.findFirst({ where: { tenantId: tenant.id, user: { email: "professora.demo@turminha.local" } }, select: { id: true } });
  if (!teacher) throw new Error("Teacher membership must be created before seeding schools.");
  await prisma.classroomStaff.upsert({ where: { tenantId_classroomId_membershipId: { tenantId: tenant.id, classroomId: classroom.id, membershipId: teacher.id } }, update: {}, create: { tenantId: tenant.id, classroomId: classroom.id, membershipId: teacher.id } });
  const familyUser = await prisma.user.upsert({ where: { email: input.familyEmail }, update: { displayName: input.familyName, passwordHash }, create: { email: input.familyEmail, displayName: input.familyName, passwordHash } });
  const familyMembership = await prisma.membership.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: familyUser.id } }, update: { role: MembershipRole.GUARDIAN, status: "ACTIVE" }, create: { tenantId: tenant.id, userId: familyUser.id, role: MembershipRole.GUARDIAN } });

  const enrollments = [];
  for (const student of input.students) {
    const saved = await prisma.student.upsert({ where: { tenantId_id: { tenantId: tenant.id, id: student.id } }, update: { displayName: student.name, publicProfile: false, publicQuote: null }, create: { id: student.id, tenantId: tenant.id, displayName: student.name, publicProfile: false } });
    const enrollment = await prisma.enrollment.upsert({ where: { tenantId_studentId_classroomId: { tenantId: tenant.id, studentId: saved.id, classroomId: classroom.id } }, update: { status: EnrollmentStatus.ACTIVE }, create: { tenantId: tenant.id, studentId: saved.id, classroomId: classroom.id, status: EnrollmentStatus.ACTIVE } });
    enrollments.push(enrollment);
  }
  const familyStudent = input.students[input.familyStudentIndex];
  await prisma.studentGuardian.upsert({ where: { tenantId_studentId_membershipId: { tenantId: tenant.id, studentId: familyStudent.id, membershipId: familyMembership.id } }, update: { approved: true, revokedAt: null }, create: { tenantId: tenant.id, studentId: familyStudent.id, membershipId: familyMembership.id, approved: true } });
  await prisma.announcement.upsert({ where: { tenantId_id: { tenantId: tenant.id, id: input.noticeId } }, update: { title: input.noticeTitle, body: input.noticeBody, visibility: NoticeVisibility.PUBLISHED }, create: { id: input.noticeId, tenantId: tenant.id, classroomId: classroom.id, title: input.noticeTitle, body: input.noticeBody, visibility: NoticeVisibility.PUBLISHED, publishedAt: new Date() } });

  if (input.slug === "colegio-pilares-demo") {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    await prisma.attendance.upsert({
      where: { tenantId_enrollmentId_classDate: { tenantId: tenant.id, enrollmentId: enrollments[0].id, classDate: new Date(`${today}T00:00:00.000Z`) } },
      update: { status: AttendanceStatus.PRESENT, recordedBy: teacher.id },
      create: { tenantId: tenant.id, enrollmentId: enrollments[0].id, classDate: new Date(`${today}T00:00:00.000Z`), status: AttendanceStatus.PRESENT, recordedBy: teacher.id },
    });
  }
  return { tenant: input.slug, students: input.students.length, classroom: input.classroomName };
}

try {
  const teacherUser = await prisma.user.upsert({ where: { email: "professora.demo@turminha.local" }, update: { displayName: "Professora Demo", passwordHash }, create: { email: "professora.demo@turminha.local", displayName: "Professora Demo", passwordHash } });
  const firstTenant = await prisma.tenant.upsert({ where: { slug: "colegio-pilares-demo" }, update: {}, create: { id: "tenant-pilares-demo", slug: "colegio-pilares-demo" } });
  const secondTenant = await prisma.tenant.upsert({ where: { slug: "escola-jardim-demo" }, update: {}, create: { id: "tenant-jardim-demo", slug: "escola-jardim-demo" } });
  for (const tenant of [firstTenant, secondTenant]) {
    await prisma.membership.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: teacherUser.id } }, update: { role: MembershipRole.TEACHER, status: "ACTIVE" }, create: { id: `member-${tenant.id}`, tenantId: tenant.id, userId: teacherUser.id, role: MembershipRole.TEACHER } });
  }
  const schoolAdminUser = await prisma.user.upsert({ where: { email: "admin.demo@turminha.local" }, update: { displayName: "Gestão Demo", passwordHash }, create: { email: "admin.demo@turminha.local", displayName: "Gestão Demo", passwordHash } });
  await prisma.membership.upsert({ where: { tenantId_userId: { tenantId: firstTenant.id, userId: schoolAdminUser.id } }, update: { role: MembershipRole.SCHOOL_ADMIN, status: "ACTIVE" }, create: { id: "member-admin-pilares-demo", tenantId: firstTenant.id, userId: schoolAdminUser.id, role: MembershipRole.SCHOOL_ADMIN } });
  const resultA = await seedSchool({ tenantId: firstTenant.id, slug: "colegio-pilares-demo", schoolId: "school-pilares-demo", schoolName: "Colégio Pilares · demonstração", displayClass: "Maternal I · demonstração", displayTeam: "Lane & Helen · nomes demonstrativos", classroomId: "class-pilares-maternal-demo", classroomName: "Maternal I", year: new Date().getFullYear(), noticeId: "notice-pilares-demo", noticeTitle: "Um dia de cores e descobertas", noticeBody: "Hoje vamos explorar tintas, cantigas e brincadeiras. Este recado é fictício e foi preparado para a demonstração local.", students: [{ id: "student-pilares-ana-demo", name: "Lia Exemplo" }, { id: "student-pilares-noah-demo", name: "Ravi Exemplo" }, { id: "student-pilares-bia-demo", name: "Noa Exemplo" }], familyEmail: "familia.pilares.demo@turminha.local", familyName: "Responsável Demo A", familyStudentIndex: 0 });
  const resultB = await seedSchool({ tenantId: secondTenant.id, slug: "escola-jardim-demo", schoolId: "school-jardim-demo", schoolName: "Escola Jardim · demonstração", displayClass: "Turma Girassol", displayTeam: "Equipe fictícia", classroomId: "class-jardim-girassol-demo", classroomName: "Turma Girassol", year: new Date().getFullYear(), noticeId: "notice-jardim-demo", noticeTitle: "Bem-vindos à Turma Girassol", noticeBody: "Um recado demonstrativo exclusivo da Escola Jardim. As escolas compartilham as tabelas, mas não os conteúdos.", students: [{ id: "student-jardim-ivo-demo", name: "Ivo Exemplo" }, { id: "student-jardim-lua-demo", name: "Lua Exemplo" }], familyEmail: "familia.jardim.demo@turminha.local", familyName: "Responsável Demo B", familyStudentIndex: 1 });
  console.log(JSON.stringify({ seeded: true, database, tenants: [resultA, resultB], sameSharedDatabase: true }));
} finally { await prisma.$disconnect(); }
