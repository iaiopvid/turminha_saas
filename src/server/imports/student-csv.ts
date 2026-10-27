import { z } from "zod";

export const IMPORT_HEADERS = ["record_type", "source_id", "name", "email", "student_source_id", "school_year", "classroom_name", "role"] as const;
export const importRowSchema = z.object({
  line: z.number().int().min(2).max(100_000),
  recordType: z.enum(["student", "guardian", "staff"]),
  sourceId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().max(254),
  studentSourceId: z.string().trim().max(100),
  schoolYear: z.string().trim().max(4),
  classroomName: z.string().trim().max(100),
  role: z.string().trim().max(20),
});
export const importRowsSchema = z.array(importRowSchema).min(1).max(500);
export type ImportRow = z.infer<typeof importRowSchema>;

export class CsvFormatError extends Error {}

function countDelimiter(line: string, delimiter: string) {
  let count = 0; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { if (quoted && line[i + 1] === '"') i++; else quoted = !quoted; }
    else if (!quoted && line[i] === delimiter) count++;
  }
  return count;
}

export function parseImportCsv(source: string): ImportRow[] {
  if (source.length > 1_000_000) throw new CsvFormatError("Arquivo CSV maior que 1 MB.");
  const text = source.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = countDelimiter(firstLine, ";") > countDelimiter(firstLine, ",") ? ";" : ",";
  const records: string[][] = [];
  let record: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"' && cell.length === 0) quoted = true;
    else if (char === delimiter) { record.push(cell); cell = ""; }
    else if (char === "\n") { record.push(cell.replace(/\r$/, "")); if (record.some((value) => value.trim())) records.push(record); record = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new CsvFormatError("Há uma aspa sem fechamento no arquivo CSV.");
  record.push(cell.replace(/\r$/, "")); if (record.some((value) => value.trim())) records.push(record);
  if (!records.length) throw new CsvFormatError("O arquivo CSV está vazio.");
  const headers = records[0]!.map((value) => value.trim().toLowerCase());
  if (headers.length !== IMPORT_HEADERS.length || headers.some((value, index) => value !== IMPORT_HEADERS[index])) throw new CsvFormatError(`O cabeçalho deve ser: ${IMPORT_HEADERS.join(",")}`);
  if (records.length - 1 > 500) throw new CsvFormatError("O limite é 500 linhas por importação.");
  const rows = records.slice(1).map((values, index) => {
    if (values.length !== IMPORT_HEADERS.length) throw new CsvFormatError(`A linha ${index + 2} tem ${values.length} colunas; esperado: ${IMPORT_HEADERS.length}.`);
    return {
      line: index + 2,
      recordType: values[0]!.trim().toLowerCase(),
      sourceId: values[1]!.trim(),
      name: values[2]!.trim(),
      email: values[3]!.trim().toLowerCase(),
      studentSourceId: values[4]!.trim(),
      schoolYear: values[5]!.trim(),
      classroomName: values[6]!.trim(),
      role: values[7]!.trim().toUpperCase(),
    };
  });
  const parsed = importRowsSchema.safeParse(rows);
  if (!parsed.success) throw new CsvFormatError("Há campos vazios ou acima dos limites do modelo. Revise cada linha.");
  return parsed.data;
}
