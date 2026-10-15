import { describe, expect, it } from "vitest";
import type { CalendarEntryLike } from "./calendar.js";
import { pickDeadline } from "./deadlines.js";
import { makeupKey, makeupOccurrences, occurrenceKey, occurrencesBetween, teachingDay, type TeachingContext } from "./schedule.js";
import { timeInZone, todayInZone } from "./clock.js";

const cal = (category: CalendarEntryLike["category"], startsOn: string, endsOn = startsOn, id = `${category}-${startsOn}`): CalendarEntryLike => ({ id, title: id, category, startsOn, endsOn, campusId: null });
const ctx = (rule: TeachingContext["rule"], calendar: CalendarEntryLike[] = [], examPeriods: TeachingContext["examPeriods"] = []): TeachingContext => ({ rule, calendar, examPeriods });
const saturdaySlot = [{ id: "sat", weekday: 6, startTime: "10:00", endTime: "11:00" }];
const dates = (slots: Parameters<typeof occurrencesBetween>[0], from: string, to: string, c: TeachingContext) => occurrencesBetween(slots, from, to, c).map((o) => o.date);

// Saturdays Sep–Nov 2026: Sep 5,12,19,26 · Oct 3,10,17,24,31 · Nov 7,14,21,28  (13 in total)
describe("planned sessions follow the Saturday rules (hand-counted over Sep–Nov 2026)", () => {
  it("all Saturdays working -> 13 sessions", () => expect(dates(saturdaySlot, "2026-09-01", "2026-11-30", ctx("ALL"))).toHaveLength(13));
  it("no Saturdays working -> 0 sessions", () => expect(dates(saturdaySlot, "2026-09-01", "2026-11-30", ctx("NONE"))).toEqual([]));
  it("2nd and 4th only -> Sep 12/26, Oct 10/24, Nov 14/28", () =>
    expect(dates(saturdaySlot, "2026-09-01", "2026-11-30", ctx("SECOND_FOURTH"))).toEqual(["2026-09-12", "2026-09-26", "2026-10-10", "2026-10-24", "2026-11-14", "2026-11-28"]));
  it("a holiday removes one of them", () =>
    expect(dates(saturdaySlot, "2026-09-01", "2026-11-30", ctx("SECOND_FOURTH", [cal("HOLIDAY", "2026-10-10")]))).toHaveLength(5));
  it("a special working day adds the 5th Saturday (31 Oct)", () =>
    expect(dates(saturdaySlot, "2026-09-01", "2026-11-30", ctx("SECOND_FOURTH", [cal("SPECIAL_WORKING_DAY", "2026-10-31")]))).toHaveLength(7));
  it("a special working day turns a Sunday into a teaching day for a Sunday slot", () => {
    const sunday = [{ id: "sun", weekday: 7, startTime: "10:00", endTime: "12:00" }];
    expect(dates(sunday, "2026-11-01", "2026-11-30", ctx("ALL"))).toEqual([]);
    const o = occurrencesBetween(sunday, "2026-11-01", "2026-11-30", ctx("ALL", [cal("SPECIAL_WORKING_DAY", "2026-11-01")]));
    expect(o.map((x) => [x.date, x.hours])).toEqual([["2026-11-01", 2]]);
  });
});

describe("exam periods and boundaries", () => {
  const monday = [{ id: "mon", weekday: 1, startTime: "09:00", endTime: "10:00" }];
  it("suspends regular classes inside an exam period (Monday 26 Oct)", () => {
    const base = dates(monday, "2026-10-01", "2026-10-31", ctx("NONE"));
    expect(base).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(dates(monday, "2026-10-01", "2026-10-31", ctx("NONE", [], [{ startsOn: "2026-10-26", endsOn: "2026-10-30" }]))).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
  });
  it("an exam period beats a special working day", () => {
    const t = teachingDay("2026-10-31", ctx("NONE", [cal("SPECIAL_WORKING_DAY", "2026-10-31")], [{ startsOn: "2026-10-30", endsOn: "2026-11-02" }]));
    expect(t).toEqual({ teaching: false, reason: "exam_period" });
  });
  it("window ends are inclusive and nothing outside is generated", () => {
    expect(dates(monday, "2026-09-07", "2026-09-07", ctx("NONE"))).toEqual(["2026-09-07"]);
    expect(dates(monday, "2026-09-08", "2026-09-13", ctx("NONE"))).toEqual([]);
    expect(dates(monday, "2026-09-14", "2026-09-07", ctx("NONE"))).toEqual([]);
  });
  it("derives identical occurrences on every call (no duplicates when recalculated)", () => {
    const a = occurrencesBetween(monday, "2026-09-01", "2026-12-18", ctx("ALL"));
    const b = occurrencesBetween(monday, "2026-09-01", "2026-12-18", ctx("ALL"));
    expect(b).toEqual(a);
    expect(new Set(a.map((o) => o.key)).size).toBe(a.length);
    expect(a[0]!.key).toBe(occurrenceKey("mon", "2026-09-07"));
  });
  it("replacement sessions for rescheduled classes stay inside the requested window", () => {
    const items = [{ logId: "l1", rescheduledTo: "2026-10-09", startTime: "14:00", endTime: "15:30", hours: 1.5 }, { logId: "l2", rescheduledTo: "2026-12-30", startTime: null, endTime: null, hours: 1 }];
    const m = makeupOccurrences(items, "2026-10-01", "2026-12-18");
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ key: makeupKey("l1"), date: "2026-10-09", hours: 1.5, entryId: null, makeupOfLogId: "l1" });
  });
});

describe("deadline selection", () => {
  const exams = [
    { type: "SESSIONAL" as const, startsOn: "2026-09-14", batchId: null },
    { type: "END_TERM" as const, startsOn: "2026-12-07", batchId: null },
    { type: "END_TERM" as const, startsOn: "2026-12-01", batchId: "b1" },
  ];
  it("uses the earliest applicable end-term and stops teaching the day before", () => {
    expect(pickDeadline(exams, "b1", "2026-12-18")).toMatchObject({ date: "2026-12-01", lastTeachingDate: "2026-11-30", source: "exam" });
    expect(pickDeadline(exams, "b2", "2026-12-18")).toMatchObject({ date: "2026-12-07", lastTeachingDate: "2026-12-06" });
  });
  it("falls back to the semester end and says so when no end-term exists", () => {
    const d = pickDeadline(exams.slice(0, 1), "b1", "2026-12-18");
    expect(d).toMatchObject({ date: "2026-12-18", lastTeachingDate: "2026-12-18", source: "semester_end" });
    expect(d.label).toMatch(/no End-term scheduled yet/);
  });
  it("can prefer another exam type", () => expect(pickDeadline([{ type: "PUT", startsOn: "2026-11-30", batchId: null }], "b", "2026-12-18", "PUT").date).toBe("2026-11-30"));
});

describe("institution time zone", () => {
  it("uses the local calendar date, not the UTC date", () => {
    const lateEveningUtc = new Date("2026-10-16T20:00:00Z"); // 01:30 on the 17th in India
    expect(todayInZone(lateEveningUtc, "Asia/Kolkata")).toBe("2026-10-17");
    expect(todayInZone(lateEveningUtc, "UTC")).toBe("2026-10-16");
    expect(timeInZone(new Date("2026-10-16T08:00:00Z"), "Asia/Kolkata")).toBe("13:30");
  });
});
