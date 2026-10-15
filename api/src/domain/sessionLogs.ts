/** Session-log rules (pure): what counts toward coverage, how hours are counted, and what makes a log valid. */
import type { ISODate } from "./dates.js";
import type { DateRange } from "./schedule.js";

export type Outcome = "COMPLETED" | "IN_PROGRESS" | "SKIPPED" | "MERGED" | "CANCELLED";
export const outcomes: Outcome[] = ["COMPLETED", "IN_PROGRESS", "SKIPPED", "MERGED", "CANCELLED"];
export const outcomeLabels: Record<Outcome, string> = { COMPLETED: "Completed", IN_PROGRESS: "In progress", SKIPPED: "Skipped", MERGED: "Merged", CANCELLED: "Cancelled" };
export type WorkStatus = "NOT_GIVEN" | "GIVEN" | "REVIEWED";
export const workStatuses: WorkStatus[] = ["NOT_GIVEN", "GIVEN", "REVIEWED"];

/** Topics covered in these sessions move the syllabus forward. Skipped and cancelled sessions never do. */
export const countsForCoverage = (o: Outcome) => o === "COMPLETED" || o === "IN_PROGRESS" || o === "MERGED";

/**
 * Teaching hours a log contributes. A merged session carries 0 because the primary log it points to already holds the hours,
 * so one class taught to two batches is counted once. Cancelled and skipped sessions are never teaching.
 */
export function taughtHours(log: { outcome: Outcome; actualHours: number | null; scheduledHours: number | null }): number {
  return log.outcome === "COMPLETED" || log.outcome === "IN_PROGRESS" ? log.actualHours ?? log.scheduledHours ?? 0 : 0;
}

export interface Issue { path: string; message: string }

export interface LogDraft {
  outcome: Outcome; heldOn: ISODate; timetableEntryId: string | null; makeupOfId: string | null;
  actualHours: number | null;
  covered: Array<{ topicId: string; completionPct: number }>; leftover: string[]; skipped: string[];
  notes: string | null; carryForward: string | null; rescheduledTo: ISODate | null; mergedIntoId: string | null;
}

export interface LogContext {
  today: ISODate;
  semester: DateRange;
  topicTitles: Map<string, string>;
  /** Latest COVERED state per topic from OTHER logs dated on or before this one. */
  priorPct: Map<string, { pct: number; heldOn: ISODate }>;
  /** Present when the log is tied to a timetable slot. */
  slot: { weekdayMatches: boolean; teaching: boolean; reason: string } | null;
  /** Present when `rescheduledTo` is set: is that date a teaching day? */
  rescheduleTarget: { teaching: boolean; reason: string } | null;
  /** Present when `mergedIntoId` is set. */
  merge: { found: boolean; isSelf: boolean; sameDate: boolean; sameFaculty: boolean; primaryOutcome: Outcome | null } | null;
}

const has = (s: string | null, min: number) => (s ?? "").trim().length >= min;

export function validateLog(d: LogDraft, c: LogContext): Issue[] {
  const out: Issue[] = [];
  const add = (path: string, message: string) => out.push({ path, message });

  if (d.heldOn > c.today) add("heldOn", "A session cannot be logged before it has happened.");
  if (d.heldOn < c.semester.startsOn || d.heldOn > c.semester.endsOn) add("heldOn", `The date must be inside the semester (${c.semester.startsOn} to ${c.semester.endsOn}).`);

  if (d.timetableEntryId && d.makeupOfId) add("makeupOfId", "A log is either a scheduled session or a make-up session, not both.");
  if (c.slot) {
    if (!c.slot.weekdayMatches) add("heldOn", "This date is not the weekday of the selected timetable slot.");
    else if (!c.slot.teaching) add("heldOn", `No class is scheduled on this date (${c.slot.reason}). Log it as an extra session instead.`);
  }

  const counts = countsForCoverage(d.outcome);
  const coveredIds = d.covered.map((t) => t.topicId);
  const all = [...coveredIds, ...d.leftover, ...d.skipped];
  for (const id of all) if (!c.topicTitles.has(id)) add("covered", `Topic ${id} does not belong to this subject.`);
  const seen = new Set<string>();
  for (const id of all) {
    if (seen.has(id)) add("covered", `"${c.topicTitles.get(id) ?? id}" is listed more than once — a topic can be covered, left over or skipped, not several at once.`);
    seen.add(id);
  }

  if (!counts && (d.covered.length > 0 || d.leftover.length > 0 || d.skipped.length > 0)) {
    add("covered", `${d.outcome === "CANCELLED" ? "Cancelled" : "Skipped"} sessions cannot record topics — nothing was taught.`);
  }
  for (const t of d.covered) {
    if (!Number.isInteger(t.completionPct) || t.completionPct < 1 || t.completionPct > 100) add("covered", `Completion for "${c.topicTitles.get(t.topicId) ?? t.topicId}" must be a whole number from 1 to 100.`);
    const prior = c.priorPct.get(t.topicId);
    if (prior && t.completionPct < prior.pct) add("covered", `"${c.topicTitles.get(t.topicId)}" is already at ${prior.pct}% (logged ${prior.heldOn}); a session cannot lower it. To undo that, correct the earlier log.`);
  }

  if ((d.outcome === "COMPLETED" || d.outcome === "IN_PROGRESS") && d.covered.length === 0 && !has(d.notes, 3)) {
    add("covered", `A ${d.outcome === "COMPLETED" ? "completed" : "in-progress"} session needs at least one topic covered, or a note explaining why none.`);
  }
  if (d.outcome === "MERGED" && d.covered.length === 0 && !has(d.notes, 3)) add("covered", "A merged session needs the topics covered for this batch, or a note explaining why none.");
  if ((d.outcome === "CANCELLED" || d.outcome === "SKIPPED") && !has(d.notes, 3)) add("notes", `Say why the session was ${d.outcome === "CANCELLED" ? "cancelled" : "skipped"}.`);

  if (d.actualHours !== null) {
    if (!(d.actualHours > 0 && d.actualHours <= 12)) add("actualHours", "Hours taught must be above 0 and at most 12.");
    if (d.outcome !== "COMPLETED" && d.outcome !== "IN_PROGRESS") add("actualHours", "Hours can only be recorded for completed or in-progress sessions.");
  }
  if (!d.timetableEntryId && !d.makeupOfId && (d.outcome === "COMPLETED" || d.outcome === "IN_PROGRESS") && d.actualHours === null) {
    add("actualHours", "An extra session has no scheduled length — enter the hours taught.");
  }

  if (d.rescheduledTo !== null) {
    if (d.outcome !== "CANCELLED") add("rescheduledTo", "Only a cancelled session can be rescheduled.");
    else if (d.rescheduledTo <= d.heldOn) add("rescheduledTo", "The new date must be after the cancelled session.");
    else if (d.rescheduledTo > c.semester.endsOn) add("rescheduledTo", "The new date must be inside the semester.");
    else if (c.rescheduleTarget && !c.rescheduleTarget.teaching) add("rescheduledTo", `The new date is not a teaching day (${c.rescheduleTarget.reason}).`);
  }

  if (d.outcome === "MERGED") {
    if (!d.mergedIntoId || !c.merge) add("mergedIntoId", "Choose the session this class was merged into.");
    else if (!c.merge.found) add("mergedIntoId", "The session this was merged into was not found.");
    else {
      if (c.merge.isSelf) add("mergedIntoId", "A session cannot be merged into itself.");
      if (!c.merge.sameDate) add("mergedIntoId", "Merged sessions must be on the same date.");
      if (!c.merge.sameFaculty) add("mergedIntoId", "A merged session must be taught by the same faculty member as the primary session.");
      if (c.merge.primaryOutcome !== "COMPLETED" && c.merge.primaryOutcome !== "IN_PROGRESS") add("mergedIntoId", "The primary session must itself be a completed or in-progress class (not merged, skipped or cancelled).");
    }
  } else if (d.mergedIntoId) add("mergedIntoId", "Only a merged session can point at a primary session.");

  return out;
}
