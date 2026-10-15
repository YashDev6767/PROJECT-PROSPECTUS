import { parseCsv, toCsv } from "./csv.js";
import { examTypes, type ExamType } from "./exams.js";

export interface TopicDraft { id?: string; title: string; plannedHours: number; examScope: ExamType | null }
export interface UnitDraft { id?: string; title: string; topics: TopicDraft[] }

export interface RowIssue { row: number; field: string; message: string }

const MAX_TOPIC_HOURS = 40;
export const MAX_IMPORT_ROWS = 2000;
export const CSV_HEADER = ["unit", "topic", "planned_hours", "exam_scope"] as const;

/** Structural rules for a syllabus held as ordered units -> ordered topics. Order is the array order. */
export function validateSyllabus(units: UnitDraft[]): RowIssue[] {
  const issues: RowIssue[] = [];
  const unitTitles = new Set<string>();
  units.forEach((u, ui) => {
    const key = u.title.trim().toLowerCase();
    if (!key) issues.push({ row: ui + 1, field: "unit", message: "Unit title is required" });
    else if (unitTitles.has(key)) issues.push({ row: ui + 1, field: "unit", message: `Duplicate unit "${u.title}"` });
    unitTitles.add(key);
    const topicTitles = new Set<string>();
    u.topics.forEach((t) => {
      const tk = t.title.trim().toLowerCase();
      if (!tk) issues.push({ row: ui + 1, field: "topic", message: `Unit "${u.title}" has a topic without a title` });
      else if (topicTitles.has(tk)) issues.push({ row: ui + 1, field: "topic", message: `Duplicate topic "${t.title}" in unit "${u.title}"` });
      topicTitles.add(tk);
      if (!(t.plannedHours > 0 && t.plannedHours <= MAX_TOPIC_HOURS)) issues.push({ row: ui + 1, field: "planned_hours", message: `Topic "${t.title}" needs planned hours between 0 and ${MAX_TOPIC_HOURS}` });
    });
  });
  return issues;
}

export const totalPlannedHours = (units: UnitDraft[]) =>
  Math.round(units.flatMap((u) => u.topics).reduce((n, t) => n + t.plannedHours, 0) * 100) / 100;

export interface CsvParseResult { units: UnitDraft[]; errors: RowIssue[]; rowCount: number }

/**
 * CSV columns: unit, topic, planned_hours, exam_scope (blank or SESSIONAL | MID_TERM | PUT | END_TERM).
 * Row order defines unit and topic order. Rows with the same unit title are grouped into one unit.
 * Every invalid row is reported (row numbers match the file, header = row 1); nothing is dropped silently.
 */
export function parseSyllabusCsv(text: string): CsvParseResult {
  const errors: RowIssue[] = [];
  let table: string[][];
  try { table = parseCsv(text); } catch (e) {
    return { units: [], errors: [{ row: 1, field: "file", message: e instanceof Error ? e.message : "Unreadable CSV" }], rowCount: 0 };
  }
  table = table.filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length === 0) return { units: [], errors: [{ row: 1, field: "file", message: "The file is empty" }], rowCount: 0 };

  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const missing = CSV_HEADER.filter((h) => h !== "exam_scope" && !header.includes(h));
  if (missing.length) return { units: [], errors: [{ row: 1, field: "header", message: `Missing column(s): ${missing.join(", ")}. Expected: ${CSV_HEADER.join(", ")}` }], rowCount: 0 };
  const col = (name: string) => header.indexOf(name);

  const body = table.slice(1);
  if (body.length > MAX_IMPORT_ROWS) return { units: [], errors: [{ row: 1, field: "file", message: `Too many rows (max ${MAX_IMPORT_ROWS})` }], rowCount: body.length };

  const units: UnitDraft[] = [];
  const seen = new Set<string>();
  body.forEach((cells, i) => {
    const row = i + 2;
    const unit = (cells[col("unit")] ?? "").trim();
    const topic = (cells[col("topic")] ?? "").trim();
    const hoursRaw = (cells[col("planned_hours")] ?? "").trim();
    const scopeRaw = col("exam_scope") >= 0 ? (cells[col("exam_scope")] ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_") : "";
    const before = errors.length;

    if (!unit) errors.push({ row, field: "unit", message: "Unit is required" });
    else if (unit.length > 120) errors.push({ row, field: "unit", message: "Unit is longer than 120 characters" });
    if (!topic) errors.push({ row, field: "topic", message: "Topic is required" });
    else if (topic.length > 160) errors.push({ row, field: "topic", message: "Topic is longer than 160 characters" });
    const hours = Number(hoursRaw);
    if (hoursRaw === "" || !Number.isFinite(hours)) errors.push({ row, field: "planned_hours", message: hoursRaw === "" ? "planned_hours is required" : `"${hoursRaw}" is not a number` });
    else if (hours <= 0 || hours > MAX_TOPIC_HOURS) errors.push({ row, field: "planned_hours", message: `planned_hours must be above 0 and at most ${MAX_TOPIC_HOURS}` });
    if (scopeRaw && !examTypes.includes(scopeRaw as ExamType)) errors.push({ row, field: "exam_scope", message: `"${cells[col("exam_scope")]}" is not one of ${examTypes.join(", ")}` });

    const key = `${unit.toLowerCase()}\u0000${topic.toLowerCase()}`;
    if (unit && topic && seen.has(key)) errors.push({ row, field: "topic", message: `Duplicate of an earlier row (${unit} / ${topic})` });
    seen.add(key);
    if (errors.length > before) return;

    let u = units.find((x) => x.title.toLowerCase() === unit.toLowerCase());
    if (!u) { u = { title: unit, topics: [] }; units.push(u); }
    u.topics.push({ title: topic, plannedHours: Math.round(hours * 100) / 100, examScope: (scopeRaw || null) as ExamType | null });
  });
  return { units, errors, rowCount: body.length };
}

export const syllabusToCsv = (units: UnitDraft[]) =>
  toCsv([...CSV_HEADER], units.flatMap((u) => u.topics.map((t) => [u.title, t.title, t.plannedHours, t.examScope])));
