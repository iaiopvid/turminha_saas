import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { EnrollmentStatus, MembershipRole } from "@/generated/prisma/client";
import { z } from "zod";
import { ContextError, resolveTenantContext } from "@/server/tenancy/context";
import { prisma } from "@/server/db/prisma";
import { CsvFormatError, importRowsSchema, parseImportCsv, type ImportRow } from "@/server/imports/student-csv";

type RowIssue = { line: number; code: string; message: string };
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), csv: z.string().min(1).max(1_000_000) }),
  z.object({ action: z.literal("dry-run"), rows: importRowsSchema }),
  z.object({ action: z.literal("commit"), rows: importRowsSchema }),
]);
const keyForClass = (year: number, name: string) => `${year}:${name.trim().toLocaleLowerCase("pt-BR")}`;
const invitationSourceKey = (row: ImportRow) => `csv:${row.recordType}:${row.sourceId}`;

function validateRowShape(row: ImportRow, issues: RowIssue[]) {
  const add = (code: string, message: string) => issues.push({ line: row.line, code, message });
  const emailValid = z.string().email().max(254).safeParse(row.email).success;
  if (row.recordType === "student") {
    if (!/^\d{4}$/.test(row.schoolYear) || Number(row.schoolYear) < 2000 || Number(row.schoolYear) > 2200) add("YEAR", "Ano letivo inválido.");
    if (!row.classroomName) add("CLASSROOM", "Informe a turma do estudante.");
    if (row.email || row.studentSourceId || row.role) add("COLUMNS", "Aluno não usa e-mail, student_source_id ou role nesta linha.");
  } else if (row.recordType === "guardian") {
    if (!emailValid) add("EMAIL", "E-mail do responsável inválido.");
    if (!row.studentSourceId) add("STUDENT_LINK", "Informe o source_id do aluno que este responsável acompanhará.");
    if (row.schoolYear || row.classroomName || row.role) add("COLUMNS", "Responsável não usa ano, turma ou role; o papel será GUARDIAN.");
  } else {
    if (!emailValid) add("EMAIL", "E-mail da equipe inválido.");
    if (!/^\d{4}$/.test(row.schoolYear) || Number(row.schoolYear) < 2000 || Number(row.schoolYear) > 2200) add("YEAR", "Ano letivo inválido.");
    if (!row.classroomName) add("CLASSROOM", "Informe a turma da equipe.");
    if (row.role !== MembershipRole.TEACHER && row.role !== MembershipRole.ASSISTANT) add("ROLE", "Role deve ser TEACHER ou ASSISTANT.");
    if (row.studentSourceId) add("COLUMNS", "Equipe não usa student_source_id.");
  }
}

async function validateRows(rows: ImportRow[], tenantId: string) {
  const issues: RowIssue[] = [];
  const sourceSeen = new Set<string>();
  for (const row of rows) {
    validateRowShape(row, issues);
    const source = `${row.recordType}:${row.sourceId}`;
    if (sourceSeen.has(source)) issues.push({ line: row.line, code: "DUPLICATE_SOURCE", message: "source_id repetido para esse tipo de registro neste arquivo." });
    sourceSeen.add(source);
  }
  const requestedClasses = rows.filter((row) => (row.recordType === "student" || row.recordType === "staff") && /^\d{4}$/.test(row.schoolYear) && row.classroomName);
  const years = [...new Set(requestedClasses.map((row) => Number(row.schoolYear)))];
  const names = [...new Set(requestedClasses.map((row) => row.classroomName))];
  const classes = await prisma.classroom.findMany({ where: { tenantId, schoolYear: { in: years }, name: { in: names }, status: EnrollmentStatus.ACTIVE }, select: { id: true, name: true, schoolYear: true, capacity: true } });
  const classMap = new Map(classes.map((item) => [keyForClass(item.schoolYear, item.name), item]));
  for (const row of requestedClasses) if (!classMap.has(keyForClass(Number(row.schoolYear), row.classroomName))) issues.push({ line: row.line, code: "CLASS_NOT_FOUND", message: "A turma ativa não existe neste ano letivo nesta escola." });

  const studentSourceKeys = [...new Set(rows.filter((row) => row.recordType === "student").map((row) => row.sourceId))];
  const guardianSourceKeys = [...new Set(rows.filter((row) => row.recordType === "guardian").map((row) => row.studentSourceId))];
  const lookupKeys = [...new Set([...studentSourceKeys, ...guardianSourceKeys].filter(Boolean))];
  const sourceRecords = lookupKeys.length ? await prisma.importedStudentSource.findMany({ where: { tenantId, sourceKey: { in: lookupKeys } }, select: { sourceKey: true, studentId: true, student: { select: { enrollments: { where: { status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.WAITLISTED] }, validUntil: null }, select: { classroomId: true } } } } } }) : [];
  const sourceMap = new Map(sourceRecords.map((item) => [item.sourceKey, item]));
  const studentRowsBySource = new Map(rows.filter((row) => row.recordType === "student").map((row) => [row.sourceId, row]));
  for (const row of rows.filter((item) => item.recordType === "guardian")) {
    if (!sourceMap.has(row.studentSourceId) && !studentRowsBySource.has(row.studentSourceId)) issues.push({ line: row.line, code: "STUDENT_NOT_FOUND", message: "O estudante informado não existe nem aparece como linha válida no arquivo." });
  }
  for (const row of rows.filter((item) => item.recordType === "student")) {
    const existing = sourceMap.get(row.sourceId);
    const target = classMap.get(keyForClass(Number(row.schoolYear), row.classroomName));
    if (existing && target) {
      const activeEnrollments = existing.student.enrollments;
      if (activeEnrollments.some((enrollment) => enrollment.classroomId !== target.id)) issues.push({ line: row.line, code: "TRANSFER_REQUIRED", message: "Esse source_id já possui matrícula ativa em outra turma; use Transferir entre turmas." });
      const historicalSameClass = await prisma.enrollment.findFirst({ where: { tenantId, studentId: existing.studentId, classroomId: target.id, status: { in: [EnrollmentStatus.TRANSFERRED, EnrollmentStatus.FINISHED] } }, select: { id: true } });
      if (historicalSameClass && !activeEnrollments.some((enrollment) => enrollment.classroomId === target.id)) issues.push({ line: row.line, code: "HISTORY_EXISTS", message: "Há matrícula histórica nesta turma; importe sem mover o histórico ou corrija manualmente." });
    }
  }

  const inviteRows = rows.filter((row) => row.recordType === "guardian" || row.recordType === "staff");
  const inviteKeys = inviteRows.map(invitationSourceKey);
  const existingInvites = inviteKeys.length ? await prisma.invitation.findMany({ where: { tenantId, sourceKey: { in: inviteKeys } }, select: { sourceKey: true, acceptedAt: true } }) : [];
  const acceptedKeys = new Set(existingInvites.filter((item) => item.acceptedAt).map((item) => item.sourceKey));
  for (const row of inviteRows) if (acceptedKeys.has(invitationSourceKey(row))) issues.push({ line: row.line, code: "INVITATION_ACCEPTED", message: "O convite associado a esse source_id já foi aceito; crie um novo registro de origem para convidar novamente." });

  const emails = [...new Set(inviteRows.map((row) => row.email).filter(Boolean))];
  if (emails.length) {
    const users = await prisma.user.findMany({ where: { email: { in: emails }, memberships: { some: { tenantId, status: "ACTIVE" } } }, select: { email: true, memberships: { where: { tenantId, status: "ACTIVE" }, select: { role: true } } } });
    const rolesByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user.memberships.map((membership) => membership.role)]));
    for (const row of inviteRows) {
      const invitedRole = row.recordType === "guardian" ? MembershipRole.GUARDIAN : row.role as MembershipRole;
      const currentRoles = rolesByEmail.get(row.email.toLowerCase()) ?? [];
      if (currentRoles.length && !currentRoles.includes(invitedRole)) issues.push({ line: row.line, code: "ROLE_CONFLICT", message: "O e-mail já tem outro perfil ativo nesta escola; a equipe deve revisar o vínculo." });
    }
  }
  const rowIssues = rows.map((row) => ({ line: row.line, issues: issues.filter((issue) => issue.line === row.line) }));
  return { issues, rowIssues, classMap, sourceMap, studentRowsBySource };
}

function isPrismaUniqueError(error: unknown) { return !!error && typeof error === "object" && "code" in error && error.code === "P2002"; }

export async function POST(request: NextRequest, { params }: { params: Promise<{ escola: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Requisição inválida." }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_100_000) return NextResponse.json({ error: "Limite do arquivo excedido." }, { status: 413 });
  const { escola } = await params;
  let context;
  try { context = await resolveTenantContext(escola, [MembershipRole.SCHOOL_ADMIN, MembershipRole.COORDINATOR]); }
  catch (error) { return NextResponse.json({ error: error instanceof ContextError ? error.message : "Acesso negado." }, { status: error instanceof ContextError ? error.status : 403 }); }
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 }); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Ação, arquivo ou linhas inválidas." }, { status: 400 });
  let rows: ImportRow[];
  if (parsed.data.action === "preview") {
    try { rows = parseImportCsv(parsed.data.csv); } catch (error) { return NextResponse.json({ error: error instanceof CsvFormatError ? error.message : "CSV inválido." }, { status: 400 }); }
  } else rows = parsed.data.rows;
  const validation = await validateRows(rows, context.tenantId);
  if (parsed.data.action !== "commit") return NextResponse.json({ rows, rowIssues: validation.rowIssues, valid: validation.issues.length === 0, mode: parsed.data.action, errorCount: validation.issues.length }, { headers: { "cache-control": "no-store" } });
  if (validation.issues.length) return NextResponse.json({ error: "Corrija todas as linhas antes de importar.", rowIssues: validation.rowIssues, valid: false }, { status: 422, headers: { "cache-control": "no-store" } });

  const canonicalRows = rows.map(({ recordType, sourceId, name, email, studentSourceId, schoolYear, classroomName, role }) => ({ recordType, sourceId, name, email, studentSourceId, schoolYear, classroomName, role }));
  const sourceHash = createHash("sha256").update(JSON.stringify(canonicalRows)).digest("hex");
  const prior = await prisma.importBatch.findUnique({ where: { tenantId_sourceHash: { tenantId: context.tenantId, sourceHash } }, select: { id: true, rowCount: true, importedStudents: true, createdInvitations: true } });
  if (prior) return NextResponse.json({ alreadyImported: true, batchId: prior.id, rowCount: prior.rowCount, importedStudents: prior.importedStudents, createdInvitations: prior.createdInvitations, invitationUrls: [] }, { headers: { "cache-control": "no-store" } });

  const invitationUrls: { name: string; email: string; role: string; url: string }[] = [];
  try {
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.importBatch.create({ data: { tenantId: context.tenantId, createdByMembershipId: context.membershipId, sourceHash, rowCount: rows.length, importedStudents: 0, createdInvitations: 0, rowErrors: [] } });
      const classIds = [...new Set(rows.filter((row) => row.recordType === "student" || row.recordType === "staff").map((row) => validation.classMap.get(keyForClass(Number(row.schoolYear), row.classroomName))?.id).filter((id): id is string => !!id))];
      const [capacities, groupedCounts] = await Promise.all([
        classIds.length ? tx.classroom.findMany({ where: { tenantId: context.tenantId, id: { in: classIds } }, select: { id: true, capacity: true } }) : [],
        classIds.length ? tx.enrollment.groupBy({ by: ["classroomId"], where: { tenantId: context.tenantId, classroomId: { in: classIds }, status: EnrollmentStatus.ACTIVE }, _count: { _all: true } }) : [],
      ]);
      const capacityByClass = new Map(capacities.map((item) => [item.id, item.capacity]));
      const countByClass = new Map(groupedCounts.map((item) => [item.classroomId, item._count._all]));
      const studentIdsBySource = new Map<string, string>();
      let studentsProcessed = 0; let invitationsCreated = 0;
      for (const row of rows.filter((item) => item.recordType === "student")) {
        const target = validation.classMap.get(keyForClass(Number(row.schoolYear), row.classroomName))!;
        const existingSource = validation.sourceMap.get(row.sourceId);
        let studentId = existingSource?.studentId;
        if (studentId) await tx.student.update({ where: { tenantId_id: { tenantId: context.tenantId, id: studentId } }, data: { displayName: row.name } });
        else {
          const student = await tx.student.create({ data: { tenantId: context.tenantId, displayName: row.name } });
          studentId = student.id;
          await tx.importedStudentSource.create({ data: { tenantId: context.tenantId, studentId, sourceKey: row.sourceId } });
        }
        const currentEnrollment = await tx.enrollment.findFirst({ where: { tenantId: context.tenantId, studentId, classroomId: target.id }, select: { id: true, status: true } });
        if (!currentEnrollment) {
          const activeCount = countByClass.get(target.id) ?? 0;
          const status = activeCount >= (capacityByClass.get(target.id) ?? 0) ? EnrollmentStatus.WAITLISTED : EnrollmentStatus.ACTIVE;
          await tx.enrollment.create({ data: { tenantId: context.tenantId, studentId, classroomId: target.id, status } });
          if (status === EnrollmentStatus.ACTIVE) countByClass.set(target.id, activeCount + 1);
        }
        studentIdsBySource.set(row.sourceId, studentId);
        studentsProcessed++;
      }
      for (const row of rows.filter((item) => item.recordType === "guardian" || item.recordType === "staff")) {
        const token = randomBytes(32).toString("base64url");
        const role = row.recordType === "guardian" ? MembershipRole.GUARDIAN : row.role as MembershipRole;
        const studentId = row.recordType === "guardian" ? studentIdsBySource.get(row.studentSourceId) ?? validation.sourceMap.get(row.studentSourceId)?.studentId : null;
        const classroomId = row.recordType === "staff" ? validation.classMap.get(keyForClass(Number(row.schoolYear), row.classroomName))!.id : null;
        const sourceKey = invitationSourceKey(row);
        const existing = await tx.invitation.findUnique({ where: { tenantId_sourceKey: { tenantId: context.tenantId, sourceKey } }, select: { id: true } });
        const input = { tenantId: context.tenantId, createdByMembershipId: context.membershipId, sourceKey, email: row.email.toLowerCase(), displayName: row.name, role, studentId, classroomId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), acceptedAt: null, revokedAt: null };
        if (existing) await tx.invitation.update({ where: { id: existing.id }, data: input });
        else await tx.invitation.create({ data: input });
        invitationUrls.push({ name: row.name, email: row.email.toLowerCase(), role, url: `/convite/${token}` });
        invitationsCreated++;
      }
      await tx.importBatch.update({ where: { id: batch.id }, data: { importedStudents: studentsProcessed, createdInvitations: invitationsCreated } });
      return { batchId: batch.id, rowCount: rows.length, importedStudents: studentsProcessed, createdInvitations: invitationsCreated };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ...result, alreadyImported: false, invitationUrls }, { status: 201, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      const saved = await prisma.importBatch.findUnique({ where: { tenantId_sourceHash: { tenantId: context.tenantId, sourceHash } }, select: { id: true, rowCount: true, importedStudents: true, createdInvitations: true } });
      if (saved) return NextResponse.json({ alreadyImported: true, batchId: saved.id, rowCount: saved.rowCount, importedStudents: saved.importedStudents, createdInvitations: saved.createdInvitations, invitationUrls: [] }, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "Lote revertido: houve conflito com registros alterados em paralelo. Revise o dry-run e tente novamente." }, { status: 409 });
  }
}
