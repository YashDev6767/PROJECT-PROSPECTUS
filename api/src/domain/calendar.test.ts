import { describe, expect, it } from "vitest";
import { projectedHours } from "./timetable.js";
import { countWorkingDays, describeDay, describeMonth, entriesForCampus, teachingDatesForWeekday, weekdayOrdinalInMonth, type CalendarEntryLike } from "./calendar.js";
import { eachDay, isoWeekday, isValidISODate, rangesOverlap } from "./dates.js";

const entry = (over: Partial<CalendarEntryLike> & Pick<CalendarEntryLike, "category" | "startsOn">): CalendarEntryLike =>
  ({ id: "e", title: "x", endsOn: over.startsOn, campusId: null, ...over });

describe("date helpers", () => {
  it("validates real calendar dates only", () => {
    expect(isValidISODate("2026-02-29")).toBe(false);
    expect(isValidISODate("2028-02-29")).toBe(true);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("26-1-1")).toBe(false);
  });
  it("computes ISO weekdays and inclusive ranges", () => {
    expect(isoWeekday("2026-10-16")).toBe(5); // Friday
    expect(isoWeekday("2026-11-01")).toBe(7); // Sunday
    expect(eachDay("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(rangesOverlap("2026-10-01", "2026-10-05", "2026-10-05", "2026-10-09")).toBe(true);
    expect(rangesOverlap("2026-10-01", "2026-10-04", "2026-10-05", "2026-10-09")).toBe(false);
  });
});

describe("Saturday ordinals", () => {
  it("counts Saturdays within each month", () => {
    expect(weekdayOrdinalInMonth("2026-10-03")).toBe(1);
    expect(weekdayOrdinalInMonth("2026-10-10")).toBe(2);
    expect(weekdayOrdinalInMonth("2026-10-31")).toBe(5);
  });
});

// Sep 2026 starts on a Tuesday, Oct on a Thursday, Nov on a Sunday: three different weekday layouts.
describe("working-day rules across Sep–Nov 2026", () => {
  const counts = (rule: "ALL" | "NONE" | "SECOND_FOURTH") => ["2026-09", "2026-10", "2026-11"].map((m) => describeMonth(m, rule, []).filter((d) => d.working).length);

  it("ALL Saturdays working", () => expect(counts("ALL")).toEqual([26, 27, 25]));
  it("NO Saturdays working", () => expect(counts("NONE")).toEqual([22, 22, 21]));
  it("only 2nd and 4th Saturdays working", () => expect(counts("SECOND_FOURTH")).toEqual([24, 24, 23]));

  it("picks the right Saturdays for the 2nd/4th rule in each month", () => {
    const working = (m: string) => describeMonth(m, "SECOND_FOURTH", []).filter((d) => d.weekday === 6 && d.working).map((d) => d.date);
    expect(working("2026-09")).toEqual(["2026-09-12", "2026-09-26"]);
    expect(working("2026-10")).toEqual(["2026-10-10", "2026-10-24"]); // 31 Oct is the 5th Saturday: off
    expect(working("2026-11")).toEqual(["2026-11-14", "2026-11-28"]);
  });

  it("treats Sundays as non-working under every Saturday rule", () => {
    for (const rule of ["ALL", "NONE", "SECOND_FOURTH"] as const) {
      expect(describeDay("2026-11-01", rule, []).working).toBe(false);
      expect(describeDay("2026-11-01", rule, []).reason).toBe("sunday");
    }
  });
});

describe("holidays, special working days and ranges", () => {
  it("a holiday overrides a normal weekday", () => {
    const d = describeDay("2026-10-02", "ALL", [entry({ category: "HOLIDAY", startsOn: "2026-10-02" })]);
    expect(d).toMatchObject({ working: false, reason: "holiday" });
  });
  it("a holiday range covers every day inside it (inclusive)", () => {
    const hol = [entry({ category: "HOLIDAY", startsOn: "2026-10-19", endsOn: "2026-10-21" })];
    expect(["2026-10-18", "2026-10-19", "2026-10-21", "2026-10-22"].map((d) => describeDay(d, "NONE", hol).reason)).toEqual(["sunday", "holiday", "holiday", "weekday"]);
  });
  it("a special working day turns a Sunday into a working day", () => {
    expect(describeDay("2026-11-01", "NONE", [entry({ category: "SPECIAL_WORKING_DAY", startsOn: "2026-11-01" })])).toMatchObject({ working: true, reason: "special_working_day" });
  });
  it("a special working day beats a holiday on the same date, and an off Saturday", () => {
    const both = [entry({ id: "h", category: "HOLIDAY", startsOn: "2026-10-31" }), entry({ id: "s", category: "SPECIAL_WORKING_DAY", startsOn: "2026-10-31" })];
    expect(describeDay("2026-10-31", "SECOND_FOURTH", both).working).toBe(true);
    expect(describeDay("2026-10-31", "SECOND_FOURTH", [entry({ category: "SPECIAL_WORKING_DAY", startsOn: "2026-10-31" })]).working).toBe(true);
  });
  it("events, exams and deadlines do not change working status but are attached to the day", () => {
    const d = describeDay("2026-10-14", "ALL", [entry({ category: "EVENT", startsOn: "2026-10-14" }), entry({ id: "x", category: "EXAM", startsOn: "2026-10-12", endsOn: "2026-10-16" })]);
    expect(d.working).toBe(true);
    expect(d.entries).toHaveLength(2);
  });
  it("filters entries by campus scope, keeping institution-wide ones", () => {
    const list = [{ campusId: null }, { campusId: "a" }, { campusId: "b" }];
    expect(entriesForCampus(list, "a")).toEqual([{ campusId: null }, { campusId: "a" }]);
  });
  it("counts working days with a holiday removed", () => {
    const hol = [entry({ category: "HOLIDAY", startsOn: "2026-10-02" })];
    expect(countWorkingDays("2026-10-01", "2026-10-31", "NONE", hol)).toBe(21);
  });
});

describe("teaching-date projection", () => {
  it("skips holidays when projecting a weekly class", () => {
    const hol = [entry({ category: "HOLIDAY", startsOn: "2026-10-12" })]; // a Monday
    expect(teachingDatesForWeekday(1, "2026-10-01", "2026-10-31", "NONE", [])).toHaveLength(4);
    expect(teachingDatesForWeekday(1, "2026-10-01", "2026-10-31", "NONE", hol)).toHaveLength(3);
  });
  it("derives hours from timetable rows and the calendar", () => {
    const rows = [{ weekday: 1, startTime: "09:00", endTime: "10:30" }, { weekday: 3, startTime: "09:00", endTime: "10:00" }];
    // October 2026: 4 Mondays (5,12,19,26) and 4 Wednesdays (7,14,21,28)
    expect(projectedHours(rows, "2026-10-01", "2026-10-31", "NONE", [])).toBe(4 * 1.5 + 4 * 1);
    expect(projectedHours([], "2026-10-01", "2026-10-31", "NONE", [])).toBe(0);
  });
});
