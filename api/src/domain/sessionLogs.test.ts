import { describe, expect, it } from "vitest";
import { countsForCoverage, taughtHours, validateLog, type LogContext, type LogDraft } from "./sessionLogs.js";

const titles = new Map([["t1", "Topic 1"], ["t2", "Topic 2"], ["t3", "Topic 3"]]);
const ctx = (over: Partial<LogContext> = {}): LogContext => ({
  today: "2026-10-16", semester: { startsOn: "2026-08-03", endsOn: "2026-12-18" }, topicTitles: titles, priorPct: new Map(),
  slot: { weekdayMatches: true, teaching: true, reason: "weekday" }, rescheduleTarget: null, merge: null, ...over,
});
const draft = (over: Partial<LogDraft> = {}): LogDraft => ({
  outcome: "COMPLETED", heldOn: "2026-10-14", timetableEntryId: "e1", makeupOfId: null, actualHours: null,
  covered: [{ topicId: "t1", completionPct: 100 }], leftover: [], skipped: [], notes: null, carryForward: null, rescheduledTo: null, mergedIntoId: null, ...over,
});
const paths = (d: LogDraft, c = ctx()) => validateLog(d, c).map((i) => i.path);

describe("what counts", () => {
  it("only completed, in-progress and merged sessions move coverage", () => {
    expect(["COMPLETED", "IN_PROGRESS", "MERGED"].every((o) => countsForCoverage(o as never))).toBe(true);
    expect(countsForCoverage("CANCELLED") || countsForCoverage("SKIPPED")).toBe(false);
  });
  it("teaching hours: merged, skipped and cancelled sessions count zero, so merged classes are counted once", () => {
    const base = { actualHours: null, scheduledHours: 1.5 };
    expect(taughtHours({ ...base, outcome: "COMPLETED" })).toBe(1.5);
    expect(taughtHours({ ...base, outcome: "IN_PROGRESS", actualHours: 1 })).toBe(1);
    expect(taughtHours({ ...base, outcome: "MERGED" })).toBe(0);
    expect(taughtHours({ ...base, outcome: "CANCELLED" })).toBe(0);
    expect(taughtHours({ ...base, outcome: "SKIPPED" })).toBe(0);
  });
});

describe("valid logs", () => {
  it("accepts a normal completed session", () => expect(validateLog(draft(), ctx())).toEqual([]));
  it("accepts an in-progress session with a partial topic and a cancelled one with a reason", () => {
    expect(validateLog(draft({ outcome: "IN_PROGRESS", covered: [{ topicId: "t2", completionPct: 40 }], leftover: ["t3"] }), ctx())).toEqual([]);
    expect(validateLog(draft({ outcome: "CANCELLED", covered: [], notes: "Faculty on leave" }), ctx())).toEqual([]);
  });
});

describe("invalid and incomplete logs", () => {
  it("rejects future dates and dates outside the semester", () => {
    expect(paths(draft({ heldOn: "2026-10-17" }))).toContain("heldOn");
    expect(paths(draft({ heldOn: "2026-08-02" }))).toContain("heldOn");
  });
  it("rejects a slot on the wrong weekday or on a non-teaching day", () => {
    expect(paths(draft(), ctx({ slot: { weekdayMatches: false, teaching: true, reason: "weekday" } }))).toContain("heldOn");
    expect(validateLog(draft(), ctx({ slot: { weekdayMatches: true, teaching: false, reason: "holiday" } }))[0]!.message).toMatch(/holiday/);
  });
  it("needs topics (or an explanation) for completed / in-progress / merged sessions", () => {
    expect(paths(draft({ covered: [] }))).toContain("covered");
    expect(paths(draft({ covered: [], notes: "Revision and doubt clearing" }))).toEqual([]);
    expect(paths(draft({ outcome: "IN_PROGRESS", covered: [] }))).toContain("covered");
  });
  it("needs a reason for cancelled and skipped sessions, and forbids topics on them", () => {
    expect(paths(draft({ outcome: "CANCELLED", covered: [] }))).toContain("notes");
    expect(paths(draft({ outcome: "SKIPPED", covered: [], notes: "Faculty unwell" }))).toEqual([]);
    expect(paths(draft({ outcome: "CANCELLED", notes: "sick" }))).toContain("covered");
  });
  it("validates percentages and refuses to lower a topic's recorded completion", () => {
    expect(paths(draft({ covered: [{ topicId: "t1", completionPct: 0 }] }))).toContain("covered");
    expect(paths(draft({ covered: [{ topicId: "t1", completionPct: 101 }] }))).toContain("covered");
    expect(paths(draft({ covered: [{ topicId: "t1", completionPct: 50.5 }] }))).toContain("covered");
    const prior = new Map([["t1", { pct: 60, heldOn: "2026-10-08" }]]);
    expect(validateLog(draft({ covered: [{ topicId: "t1", completionPct: 40 }] }), ctx({ priorPct: prior }))[0]!.message).toMatch(/already at 60% \(logged 2026-10-08\)/);
    expect(validateLog(draft({ covered: [{ topicId: "t1", completionPct: 60 }] }), ctx({ priorPct: prior }))).toEqual([]);
  });
  it("rejects unknown topics and a topic listed twice", () => {
    expect(paths(draft({ covered: [{ topicId: "nope", completionPct: 10 }] }))).toContain("covered");
    expect(validateLog(draft({ leftover: ["t1"] }), ctx())[0]!.message).toMatch(/more than once/);
  });
  it("validates hours and extra sessions", () => {
    expect(paths(draft({ actualHours: 0 }))).toContain("actualHours");
    expect(paths(draft({ actualHours: 13 }))).toContain("actualHours");
    expect(paths(draft({ outcome: "CANCELLED", covered: [], notes: "x y z", actualHours: 1 }))).toContain("actualHours");
    expect(paths(draft({ timetableEntryId: null }))).toContain("actualHours"); // extra session needs its length
    expect(paths(draft({ timetableEntryId: null, actualHours: 1 }))).toEqual([]);
  });
  it("validates rescheduling", () => {
    const cancelled = draft({ outcome: "CANCELLED", covered: [], notes: "Strike", rescheduledTo: "2026-10-20" });
    expect(validateLog(cancelled, ctx({ rescheduleTarget: { teaching: true, reason: "weekday" } }))).toEqual([]);
    expect(paths({ ...cancelled, rescheduledTo: "2026-10-14" })).toContain("rescheduledTo");
    expect(paths({ ...cancelled, rescheduledTo: "2027-01-05" })).toContain("rescheduledTo");
    expect(paths(cancelled, ctx({ rescheduleTarget: { teaching: false, reason: "holiday" } }))).toContain("rescheduledTo");
    expect(paths(draft({ rescheduledTo: "2026-10-20" }))).toContain("rescheduledTo");
  });
  it("validates merged sessions against the primary log", () => {
    const merged = draft({ outcome: "MERGED", mergedIntoId: "p1" });
    const ok = { found: true, isSelf: false, sameDate: true, sameFaculty: true, primaryOutcome: "COMPLETED" as const };
    expect(validateLog(merged, ctx({ merge: ok }))).toEqual([]);
    expect(paths(merged)).toContain("mergedIntoId");
    expect(paths(merged, ctx({ merge: { ...ok, found: false } }))).toContain("mergedIntoId");
    expect(paths(merged, ctx({ merge: { ...ok, sameDate: false } }))).toContain("mergedIntoId");
    expect(paths(merged, ctx({ merge: { ...ok, sameFaculty: false } }))).toContain("mergedIntoId");
    expect(paths(merged, ctx({ merge: { ...ok, primaryOutcome: "MERGED" } }))).toContain("mergedIntoId");
    expect(paths(merged, ctx({ merge: { ...ok, isSelf: true } }))).toContain("mergedIntoId");
    expect(paths(draft({ mergedIntoId: "p1" }))).toContain("mergedIntoId");
  });
});
