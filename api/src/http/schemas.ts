/** Request-shape validation (zod). Cross-field and business rules live in the domain modules. */
import { z } from "zod";
import { campusIds } from "../data/campuses.js";
import { calendarCategories, saturdayRules } from "../domain/calendar.js";
import { isValidISODate } from "../domain/dates.js";
import { examTypes } from "../domain/exams.js";
import { validateAcademicYear, validateDateRange } from "../domain/semesters.js";
import { validateSlot } from "../domain/timetable.js";
import type { Issue } from "./errors.js";

export const isoDate = z.string().refine(isValidISODate, "Use a real date in YYYY-MM-DD format");
const text = (max: number) => z.string().trim().min(1, "Required").max(max, `At most ${max} characters`);
const optionalText = (max: number) =>
  z.string().trim().max(max, `At most ${max} characters`).nullish().transform((v) => (v ? v : null));
const id = z.string().min(1).max(64);

export const campusId = z.enum(campusIds, { message: "Unknown campus" });
export const track = z.enum(["MIRAI", "UNIVERSITY"], { message: "Track must be MIRAI or UNIVERSITY" });
export const saturdayRule = z.enum(saturdayRules, { message: "Saturday rule must be ALL, NONE or SECOND_FOURTH" });
export const examType = z.enum(examTypes, { message: "Unknown exam type" });
export const category = z.enum(calendarCategories, { message: "Unknown calendar category" });
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

const issue = (path: string, message: string | null): Issue[] => (message ? [{ path, message }] : []);

/* ---------- semesters ---------- */
export const semesterFields = z.object({
  name: text(80), academicYear: text(9), track, campusId, startsOn: isoDate, endsOn: isoDate,
  saturdayRule: saturdayRule.default("SECOND_FOURTH"),
});
export const semesterCreate = semesterFields.extend({ confirmOverlap: z.boolean().optional() });
export const semesterUpdate = semesterFields.partial().extend({ confirmOverlap: z.boolean().optional() });
export const semesterIssues = (s: { academicYear: string; startsOn: string; endsOn: string }): Issue[] => [
  ...issue("academicYear", validateAcademicYear(s.academicYear)),
  ...issue("endsOn", validateDateRange(s.startsOn, s.endsOn)),
];
export const confirmBody = z.object({ confirm: z.boolean().optional() }).default({});

/* ---------- calendar ---------- */
export const calendarFields = z.object({
  title: text(120), category, startsOn: isoDate, endsOn: isoDate.nullish(),
  campusId: campusId.nullish().transform((v) => v ?? null), description: optionalText(500),
});
export const calendarUpdate = z.object({
  title: text(120).optional(), category: category.optional(), startsOn: isoDate.optional(), endsOn: isoDate.optional(),
  campusId: campusId.nullable().optional(), description: optionalText(500).optional(),
});
export const calendarIssues = (e: { startsOn: string; endsOn: string }): Issue[] => {
  const issues = issue("endsOn", validateDateRange(e.startsOn, e.endsOn));
  const days = (Date.parse(e.endsOn) - Date.parse(e.startsOn)) / 86_400_000;
  if (days > 366) issues.push({ path: "endsOn", message: "A calendar entry can span at most one year" });
  return issues;
};
export const monthQuery = z.object({ campusId, track, month });

/* ---------- exams ---------- */
export const examFields = z.object({
  name: text(100), type: examType, semesterId: id, batchId: id.nullish().transform((v) => v ?? null),
  startsOn: isoDate, endsOn: isoDate, notes: optionalText(500),
});
export const examCreate = examFields.extend({ confirmOverlap: z.boolean().optional() });
export const examUpdate = z.object({
  name: text(100).optional(), type: examType.optional(), batchId: id.nullable().optional(),
  startsOn: isoDate.optional(), endsOn: isoDate.optional(), notes: optionalText(500).optional(), confirmOverlap: z.boolean().optional(),
});

/* ---------- batches, faculty, subjects ---------- */
export const batchCreate = z.object({ name: text(60), semesterId: id, studentCount: z.number().int().min(0).max(5000).nullish().transform((v) => v ?? null) });
export const batchUpdate = z.object({ name: text(60).optional(), studentCount: z.number().int().min(0).max(5000).nullable().optional() });

export const facultyCreate = z.object({
  name: text(100), campusId,
  email: z.string().trim().max(200).email("Enter a valid email").nullish().transform((v) => v || null),
});
export const facultyUpdate = z.object({
  name: text(100).optional(), campusId: campusId.optional(),
  email: z.string().trim().max(200).email("Enter a valid email").nullable().optional().transform((v) => (v === "" ? null : v)),
});

const hours = z.number().positive("Must be above 0").max(1000, "Must be at most 1000");
export const subjectCreate = z.object({
  code: text(20), name: text(120), batchId: id,
  facultyId: id.nullish().transform((v) => v ?? null), plannedHours: hours.nullish().transform((v) => v ?? null),
});
export const subjectUpdate = z.object({
  code: text(20).optional(), name: text(120).optional(), batchId: id.optional(),
  facultyId: id.nullable().optional(), plannedHours: hours.nullable().optional(),
});

/* ---------- timetable ---------- */
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM (24-hour)");
export const timetableCreate = z.object({
  subjectId: id, weekday: z.number().int().min(1, "Weekday is 1 (Mon) to 6 (Sat)").max(6, "Weekday is 1 (Mon) to 6 (Sat)"),
  startTime: hhmm, endTime: hhmm, room: optionalText(40),
});
export const timetableUpdate = z.object({
  weekday: z.number().int().min(1).max(6).optional(), startTime: hhmm.optional(), endTime: hhmm.optional(), room: optionalText(40).optional(),
});
export const slotIssues = (s: { startTime: string; endTime: string }): Issue[] => issue("endTime", validateSlot(s.startTime, s.endTime));

/* ---------- syllabus ---------- */
const topic = z.object({ id: id.optional(), title: z.string().trim().max(160), plannedHours: z.number().max(1000), examScope: examType.nullish().transform((v) => v ?? null) });
const unit = z.object({ id: id.optional(), title: z.string().trim().max(120), topics: z.array(topic).max(500) });
export const syllabusBody = z.object({ units: z.array(unit).max(200) });
export const csvBody = z.object({ csv: z.string().max(1_000_000), confirmReplace: z.boolean().optional() });
export const confirmQuery = z.object({ confirm: z.enum(["true", "false"]).optional() });

/* ---------- Phase 3: session logs & progression ---------- */
import { outcomes, workStatuses } from "../domain/sessionLogs.js";

const nullishId = id.nullish().transform((v) => v ?? null);
const nullishDate = isoDate.nullish().transform((v) => v ?? null);
const outcome = z.enum(outcomes, { message: "Outcome must be COMPLETED, IN_PROGRESS, SKIPPED, MERGED or CANCELLED" });
const workStatus = z.enum(workStatuses, { message: "Use NOT_GIVEN, GIVEN or REVIEWED" });
const coveredItem = z.object({ topicId: id, completionPct: z.number() });

export const sessionLogCreate = z.object({
  subjectId: id, heldOn: isoDate, timetableEntryId: nullishId, makeupOfId: nullishId, outcome,
  actualHours: z.number().nullish().transform((v) => v ?? null),
  covered: z.array(coveredItem).max(200).default([]), leftover: z.array(id).max(200).default([]), skipped: z.array(id).max(200).default([]),
  carryForward: optionalText(1000), notes: optionalText(1000),
  classworkStatus: workStatus.default("NOT_GIVEN"), homeworkStatus: workStatus.default("NOT_GIVEN"),
  rescheduledTo: nullishDate, mergedIntoId: nullishId,
});
export const sessionLogUpdate = z.object({
  correctionNote: z.string().trim().min(3, "Explain the correction (at least 3 characters)").max(500),
  outcome: outcome.optional(), actualHours: z.number().nullable().optional(),
  covered: z.array(coveredItem).max(200).optional(), leftover: z.array(id).max(200).optional(), skipped: z.array(id).max(200).optional(),
  carryForward: optionalText(1000).optional(), notes: optionalText(1000).optional(),
  classworkStatus: workStatus.optional(), homeworkStatus: workStatus.optional(),
  rescheduledTo: isoDate.nullable().optional(), mergedIntoId: id.nullable().optional(),
});
export const reviewBody = z.object({ note: optionalText(500) }).default({ note: null });
export const sessionLogQuery = z.object({
  campusId: campusId.optional(), track: track.optional(), semesterId: id.optional(), batchId: id.optional(), subjectId: id.optional(), facultyId: id.optional(),
  from: isoDate.optional(), to: isoDate.optional(), outcome: outcome.optional(), reviewed: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const scheduleQuery = z.object({ date: isoDate, campusId, track: track.optional(), facultyId: id.optional() });
export const pendingQuery = z.object({ campusId, track: track.optional(), facultyId: id.optional(), days: z.coerce.number().int().min(1).max(31).default(14) });
export const asOfQuery = z.object({ asOf: isoDate.optional() });
export const progressionQuery = z.object({ campusId, track: track.optional(), semesterId: id.optional(), batchId: id.optional(), asOf: isoDate.optional() });
