/**
 * Academic-calendar rules (pure). Precedence for whether a day is a teaching day:
 *   1. a Special Working Day entry covering the date  -> working (explicit override of anything below)
 *   2. a Holiday entry covering the date              -> not working
 *   3. Sunday                                         -> not working
 *   4. Saturday                                       -> per the semester's Saturday rule
 *   5. Monday-Friday                                  -> working
 * Events, exams and academic deadlines are informational and never change working status.
 */
import { addDays, eachDay, isoWeekday, monthBounds, rangesOverlap, type ISODate } from "./dates.js";

export type SaturdayRule = "ALL" | "NONE" | "SECOND_FOURTH";
export type CalendarCategory = "HOLIDAY" | "EVENT" | "EXAM" | "ACADEMIC_DEADLINE" | "SPECIAL_WORKING_DAY";
export const saturdayRules: SaturdayRule[] = ["ALL", "NONE", "SECOND_FOURTH"];
export const calendarCategories: CalendarCategory[] = ["HOLIDAY", "EVENT", "EXAM", "ACADEMIC_DEADLINE", "SPECIAL_WORKING_DAY"];

export interface CalendarEntryLike {
  id: string;
  title: string;
  category: CalendarCategory;
  startsOn: ISODate;
  endsOn: ISODate;
  campusId: string | null; // null = institution-wide
}

export type DayReason = "weekday" | "saturday_working" | "saturday_off" | "sunday" | "holiday" | "special_working_day";

export interface DayInfo {
  date: ISODate;
  weekday: number;
  working: boolean;
  reason: DayReason;
  entries: CalendarEntryLike[];
}

/** 1 for the first Saturday of the month, 2 for the second, ... */
export const weekdayOrdinalInMonth = (iso: ISODate) => Math.ceil(Number(iso.slice(8, 10)) / 7);

export const entriesForCampus = <T extends { campusId: string | null }>(entries: T[], campusId: string) =>
  entries.filter((e) => e.campusId === null || e.campusId === campusId);

export function describeDay(date: ISODate, rule: SaturdayRule, entries: CalendarEntryLike[]): DayInfo {
  const weekday = isoWeekday(date);
  const covering = entries.filter((e) => e.startsOn <= date && date <= e.endsOn);
  const base = { date, weekday, entries: covering };

  if (covering.some((e) => e.category === "SPECIAL_WORKING_DAY")) return { ...base, working: true, reason: "special_working_day" };
  if (covering.some((e) => e.category === "HOLIDAY")) return { ...base, working: false, reason: "holiday" };
  if (weekday === 7) return { ...base, working: false, reason: "sunday" };
  if (weekday === 6) {
    const ord = weekdayOrdinalInMonth(date);
    const working = rule === "ALL" || (rule === "SECOND_FOURTH" && (ord === 2 || ord === 4));
    return { ...base, working, reason: working ? "saturday_working" : "saturday_off" };
  }
  return { ...base, working: true, reason: "weekday" };
}

export function describeRange(from: ISODate, to: ISODate, rule: SaturdayRule, entries: CalendarEntryLike[]): DayInfo[] {
  const relevant = entries.filter((e) => rangesOverlap(e.startsOn, e.endsOn, from, to));
  return eachDay(from, to).map((d) => describeDay(d, rule, relevant));
}

/** Month grid data for "YYYY-MM". */
export const describeMonth = (month: string, rule: SaturdayRule, entries: CalendarEntryLike[]) => {
  const { from, to } = monthBounds(month);
  return describeRange(from, to, rule, entries);
};

export const countWorkingDays = (from: ISODate, to: ISODate, rule: SaturdayRule, entries: CalendarEntryLike[]) =>
  describeRange(from, to, rule, entries).filter((d) => d.working).length;

/** Dates on which a class held every `weekday` would actually run (used to project scheduled teaching hours). */
export const teachingDatesForWeekday = (weekday: number, from: ISODate, to: ISODate, rule: SaturdayRule, entries: CalendarEntryLike[]) =>
  describeRange(from, to, rule, entries).filter((d) => d.weekday === weekday && d.working).map((d) => d.date);

/** Policy check: only these need an authorised role (enforced in the API). */
export const requiresSpecialWorkingPermission = (category: CalendarCategory) => category === "SPECIAL_WORKING_DAY";

export { addDays };
