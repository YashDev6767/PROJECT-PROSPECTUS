import { eachDay, weekdayNames, type ISODate } from "./dates.js";
import { teachingDatesForWeekday, type CalendarEntryLike, type SaturdayRule } from "./calendar.js";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function toMinutes(time: string): number | null {
  const m = TIME_RE.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function validateSlot(startTime: string, endTime: string): string | null {
  const s = toMinutes(startTime), e = toMinutes(endTime);
  if (s === null || e === null) return "Times must be in 24-hour HH:MM format";
  return e > s ? null : "End time must be after the start time";
}

export const slotHours = (startTime: string, endTime: string) => ((toMinutes(endTime) ?? 0) - (toMinutes(startTime) ?? 0)) / 60;

export interface SlotRow {
  id?: string;
  weekday: number;
  startTime: string;
  endTime: string;
  batchId: string;
  batchName: string;
  facultyId: string | null;
  facultyName: string | null;
  subjectName: string;
}

export interface Conflict { type: "faculty" | "batch"; withEntryId: string | undefined; message: string }

const slotsOverlap = (a: SlotRow, b: SlotRow) =>
  a.weekday === b.weekday && (toMinutes(a.startTime) ?? 0) < (toMinutes(b.endTime) ?? 0) && (toMinutes(b.startTime) ?? 0) < (toMinutes(a.endTime) ?? 0);

/** Back-to-back classes (one ends when the next starts) are not conflicts. */
export function findConflicts(candidate: SlotRow, existing: SlotRow[]): Conflict[] {
  const out: Conflict[] = [];
  for (const row of existing) {
    if (row.id !== undefined && row.id === candidate.id) continue;
    if (!slotsOverlap(candidate, row)) continue;
    const when = `${weekdayNames[row.weekday]} ${row.startTime}–${row.endTime}`;
    if (candidate.facultyId && row.facultyId === candidate.facultyId) {
      out.push({ type: "faculty", withEntryId: row.id, message: `${row.facultyName ?? "This faculty member"} already teaches ${row.subjectName} to ${row.batchName} on ${when}.` });
    }
    if (row.batchId === candidate.batchId) {
      out.push({ type: "batch", withEntryId: row.id, message: `${row.batchName} already has ${row.subjectName} on ${when}.` });
    }
  }
  return out;
}

/** Weekly hours derived from timetable rows (never stored). */
export const weeklyHours = (rows: Array<{ startTime: string; endTime: string }>) =>
  Math.round(rows.reduce((n, r) => n + slotHours(r.startTime, r.endTime), 0) * 100) / 100;

/**
 * Hours that the timetable would deliver between two dates, skipping holidays / non-working days
 * according to the calendar rules.
 */
export function projectedHours(
  rows: Array<{ weekday: number; startTime: string; endTime: string }>,
  from: ISODate, to: ISODate, rule: SaturdayRule, calendar: CalendarEntryLike[],
): number {
  if (from > to || rows.length === 0) return 0;
  const total = rows.reduce((n, r) => n + slotHours(r.startTime, r.endTime) * teachingDatesForWeekday(r.weekday, from, to, rule, calendar).length, 0);
  return Math.round(total * 100) / 100;
}

export { eachDay };
