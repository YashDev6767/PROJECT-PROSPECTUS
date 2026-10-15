/**
 * Planned teaching schedule (pure). A teaching day is a calendar working day that is not inside an exam period
 * applicable to the batch. Occurrences are DERIVED from the timetable every time — never stored — so recalculating
 * after a timetable, holiday or exam change cannot create duplicates.
 */
import { describeDay, type CalendarEntryLike, type DayReason, type SaturdayRule } from "./calendar.js";
import { eachDay, isoWeekday, type ISODate } from "./dates.js";
import { slotHours } from "./timetable.js";

export interface Slot { id: string; weekday: number; startTime: string; endTime: string }
export interface DateRange { startsOn: ISODate; endsOn: ISODate }
export interface TeachingContext { rule: SaturdayRule; calendar: CalendarEntryLike[]; examPeriods: DateRange[] }
export type NonTeachingReason = DayReason | "exam_period";

export interface Occurrence {
  key: string; // `${entryId}@${date}` or `makeup:${logId}`
  date: ISODate;
  entryId: string | null;
  startTime: string;
  endTime: string;
  hours: number;
  makeupOfLogId: string | null;
}

export const occurrenceKey = (entryId: string, date: ISODate) => `${entryId}@${date}`;
export const makeupKey = (logId: string) => `makeup:${logId}`;

/** Exam periods suspend regular classes, even on a special working day. */
export function teachingDay(date: ISODate, ctx: TeachingContext): { teaching: boolean; reason: NonTeachingReason } {
  if (ctx.examPeriods.some((p) => p.startsOn <= date && date <= p.endsOn)) return { teaching: false, reason: "exam_period" };
  const d = describeDay(date, ctx.rule, ctx.calendar);
  return { teaching: d.working, reason: d.reason };
}

/** Every class that the timetable plans between two dates (inclusive), in date/time order. */
export function occurrencesBetween(slots: Slot[], from: ISODate, to: ISODate, ctx: TeachingContext): Occurrence[] {
  if (from > to || slots.length === 0) return [];
  const out: Occurrence[] = [];
  for (const date of eachDay(from, to)) {
    const weekday = isoWeekday(date);
    const todays = slots.filter((s) => s.weekday === weekday);
    if (todays.length === 0 || !teachingDay(date, ctx).teaching) continue;
    for (const s of todays) out.push({ key: occurrenceKey(s.id, date), date, entryId: s.id, startTime: s.startTime, endTime: s.endTime, hours: slotHours(s.startTime, s.endTime), makeupOfLogId: null });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

export interface RescheduledSession { logId: string; rescheduledTo: ISODate; startTime: string | null; endTime: string | null; hours: number }

/** A cancelled session that was rescheduled adds a replacement session on the new date. */
export function makeupOccurrences(items: RescheduledSession[], from: ISODate, to: ISODate): Occurrence[] {
  return items
    .filter((i) => i.hours > 0 && i.rescheduledTo >= from && i.rescheduledTo <= to)
    .map((i) => ({ key: makeupKey(i.logId), date: i.rescheduledTo, entryId: null, startTime: i.startTime ?? "00:00", endTime: i.endTime ?? "00:00", hours: i.hours, makeupOfLogId: i.logId }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const sortOccurrences = (list: Occurrence[]) => [...list].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
