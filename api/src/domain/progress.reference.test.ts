/**
 * Hand-calculated reference cases. Scenario used by every case below:
 *   Topics   T1..T4, 4 h each (16 h in scope)
 *   Timetable Monday 09:00–10:00 (1 h) and Wednesday 09:00–10:30 (1.5 h); Saturday rule irrelevant; no holidays
 *   Semester starts Mon 7 Sep 2026; end-term exam starts Mon 9 Nov -> last teaching day Sun 8 Nov
 *   Reference date Mon 5 Oct 2026
 * Hand arithmetic
 *   sessions before 5 Oct: Mondays 7,14,21,28 Sep (4 × 1 h) + Wednesdays 9,16,23,30 Sep (4 × 1.5 h) = 10 h planned so far
 *   sessions 5 Oct–8 Nov : Mondays 5,12,19,26 Oct + 2 Nov (5 × 1 h) + Wednesdays 7,14,21,28 Oct + 4 Nov (5 × 1.5 h) = 12.5 h available
 */
import { describe, expect, it } from "vitest";
import type { Thresholds } from "./progress.js";
import { allocate, classify, computeCoverage, evaluateProgress, resolveTopicStates, round2, worstStatus, type TopicEntryInput, type TopicInput, type TopicState } from "./progress.js";
import { makeupOccurrences, occurrencesBetween, type TeachingContext } from "./schedule.js";

const ctx: TeachingContext = { rule: "NONE", calendar: [], examPeriods: [] };
const mon = { id: "mon", weekday: 1, startTime: "09:00", endTime: "10:00" };
const wed = { id: "wed", weekday: 3, startTime: "09:00", endTime: "10:30" };
const topics: TopicInput[] = [1, 2, 3, 4].map((n) => ({ id: `T${n}`, title: `Topic ${n}`, unitTitle: "Unit 1", plannedHours: 4 }));
const REF = "2026-10-05";
const baseline = occurrencesBetween([mon, wed], "2026-09-07", "2026-11-08", ctx);
const afterDeadline = occurrencesBetween([mon, wed], "2026-11-09", "2026-12-18", ctx);
const states = (pcts: Record<string, number>): Map<string, TopicState> => new Map(Object.entries(pcts).map(([id, pct]) => [id, { kind: "covered", pct }]));
const run = (pcts: Record<string, number>, over: Partial<Parameters<typeof evaluateProgress>[0]> = {}) =>
  evaluateProgress({ topics, states: states(pcts), baseline, makeups: [], resolvedKeys: new Set(), afterDeadline, referenceDate: REF, deadlineLabel: "End-term starts 2026-11-09", lastTeachingDate: "2026-11-08", ...over });

describe("scenario sanity (the hand arithmetic itself)", () => {
  it("has 9 Mondays and 9 Wednesdays in the window, 10 h before the reference date and 12.5 h after", () => {
    expect(baseline).toHaveLength(18);
    expect(baseline.filter((o) => o.date < REF).reduce((n, o) => n + o.hours, 0)).toBe(10);
    expect(baseline.filter((o) => o.date >= REF).reduce((n, o) => n + o.hours, 0)).toBe(12.5);
  });
});

describe("REFERENCE A — ON TRACK although behind the original plan", () => {
  // T1 100% (4 h) + T2 50% (2 h) = 6 h covered, 10 h remaining, buffer 12.5 / 10 = 1.25
  const r = run({ T1: 100, T2: 50 });
  it("coverage maths", () => {
    expect(r.hoursInScope).toBe(16);
    expect(r.coveredHours).toBe(6);
    expect(r.remainingHours).toBe(10);
    expect(r.coveragePct).toBe(37.5);
  });
  it("capacity, buffer and risk", () => {
    expect(r.availableHours).toBe(12.5);
    expect(r.bufferRatio).toBe(1.25);
    expect(r.risk).toBe("ON_TRACK");
  });
  it("pace vs plan = 6 − 10 = −4.00 (behind, yet still safe)", () => {
    expect(r.plannedToDateHours).toBe(10);
    expect(r.paceHours).toBe(-4);
    expect(r.reasons.join(" ")).toMatch(/4 h behind the original plan.*remaining capacity still covers it/);
  });
  it("projects completion when cumulative future hours reach 10 h (28 Oct)", () => expect(r.projectedCompletion).toBe("2026-10-28"));
  it("original plan ends: T1 16 Sep, T2 28 Sep, T3 7 Oct, T4 19 Oct; only T2 is overdue", () => {
    expect(r.topics.map((t) => t.plannedEnd)).toEqual(["2026-09-16", "2026-09-28", "2026-10-07", "2026-10-19"]);
    expect(r.overdueTopics.map((t) => t.topicId)).toEqual(["T2"]);
  });
  it("counts the 8 un-logged past sessions explicitly", () => expect(r.unloggedPastSessions).toBe(8));
});

describe("REFERENCE B — TIGHT", () => {
  // T1 100% + T2 25% = 5 h covered, 11 h remaining, buffer 12.5 / 11 = 1.1363… -> 1.14
  const r = run({ T1: 100, T2: 25 });
  it("numbers", () => {
    expect(r.coveredHours).toBe(5);
    expect(r.remainingHours).toBe(11);
    expect(r.coveragePct).toBe(31.25);
    expect(r.availableHours).toBe(12.5);
    expect(r.bufferRatio).toBe(1.14);
    expect(r.paceHours).toBe(-5);
    expect(r.risk).toBe("TIGHT");
    expect(r.projectedCompletion).toBe("2026-11-02"); // cumulative 11 h on Monday 2 Nov
  });
  it("explains why", () => expect(r.headline).toMatch(/Tight: 12.5 h of teaching left for 11 h .*buffer 1.14/));
});

describe("REFERENCE C — DANGER", () => {
  // T1 50% = 2 h covered, 14 h remaining, buffer 12.5 / 14 = 0.892857… -> 0.89
  const r = run({ T1: 50 });
  it("numbers", () => {
    expect(r.coveredHours).toBe(2);
    expect(r.remainingHours).toBe(14);
    expect(r.coveragePct).toBe(12.5);
    expect(r.bufferRatio).toBe(0.89);
    expect(r.paceHours).toBe(-8);
    expect(r.risk).toBe("DANGER");
  });
  it("is short by 1.5 h and would finish after the deadline (11 Nov)", () => {
    expect(r.reasons).toContain("Short by 1.5 h before the deadline.");
    expect(r.projectedCompletion).toBe("2026-11-11"); // 12.5 h by 4 Nov, +1 (Mon 9 Nov) = 13.5, +1.5 (Wed 11 Nov) = 15 ≥ 14
    expect(r.reasons.join(" ")).toMatch(/Projected to finish on 2026-11-11 — after the deadline/);
  });
  it("lists the two overdue topics", () => expect(r.overdueTopics.map((t) => t.topicId)).toEqual(["T1", "T2"]));
});

describe("low progress is not DANGER when capacity is sufficient", () => {
  it("0% covered with 12.5 h available for 8 h of scope is ON TRACK", () => {
    const small = topics.slice(0, 2); // 8 h scope
    const r = evaluateProgress({ topics: small, states: new Map(), baseline, makeups: [], resolvedKeys: new Set(), referenceDate: REF, deadlineLabel: null, lastTeachingDate: "2026-11-08" });
    expect(r.coveragePct).toBe(0);
    expect(r.bufferRatio).toBe(1.56); // 12.5 / 8 = 1.5625
    expect(r.risk).toBe("ON_TRACK");
  });
});

describe("COMPLETE, empty scope, no capacity, no deadline", () => {
  it("COMPLETE when every in-scope hour is covered; no NaN and remaining never negative", () => {
    const r = run({ T1: 100, T2: 100, T3: 100, T4: 100 });
    expect(r).toMatchObject({ risk: "COMPLETE", remainingHours: 0, coveragePct: 100, bufferRatio: null, projectedCompletion: null, paceHours: 6 });
  });
  it("a subject with no syllabus hours is UNKNOWN with null coverage, not NaN", () => {
    const r = run({}, { topics: [] });
    expect(r).toMatchObject({ risk: "UNKNOWN", hoursInScope: 0, coveragePct: null, bufferRatio: null });
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
  });
  it("no available hours before the deadline -> buffer 0.00 and DANGER", () => {
    const r = run({ T1: 100, T2: 50 }, { referenceDate: "2026-11-09" });
    expect(r).toMatchObject({ availableHours: 0, bufferRatio: 0, risk: "DANGER", paceHours: -10, plannedToDateHours: 16 });
    expect(r.headline).toMatch(/No scheduled teaching hours remain/);
  });
  it("a missing deadline is UNKNOWN, never a guess", () => {
    const r = run({ T1: 100 }, { lastTeachingDate: null, deadlineLabel: null });
    expect(r).toMatchObject({ risk: "UNKNOWN", availableHours: null, bufferRatio: null });
  });
});

describe("skipped and partial topics", () => {
  it("topics marked Skipped leave scope, together with any coverage they had", () => {
    const st = new Map<string, TopicState>([["T1", { kind: "covered", pct: 100 }], ["T2", { kind: "covered", pct: 50 }], ["T4", { kind: "skipped", pct: 0 }]]);
    const r = run({}, { states: st });
    expect(r).toMatchObject({ hoursInScope: 12, coveredHours: 6, remainingHours: 6, coveragePct: 50, bufferRatio: 2.08, risk: "ON_TRACK" });
    expect(r.topics[3]).toMatchObject({ status: "skipped", plannedHours: 4, coveredHours: 0 });
  });
  it("a skipped topic that had partial coverage does not leak covered hours", () => {
    const c = computeCoverage(topics, new Map([["T1", { kind: "skipped", pct: 0 }], ["T2", { kind: "covered", pct: 25 }]]));
    expect([c.scope, c.covered, c.remaining]).toEqual([12, 1, 11]);
  });
  it("rounds to two decimals only at the end (33% of 3 h = 0.99 h)", () => {
    const c = computeCoverage([{ id: "x", title: "x", unitTitle: "u", plannedHours: 3 }], new Map([["x", { kind: "covered", pct: 33 }]]));
    expect(round2(c.covered)).toBe(0.99);
    expect(round2(c.remaining)).toBe(2.01);
    expect(round2(c.coveragePct ?? 0)).toBe(33);
  });
});

describe("no double counting: topic state is the latest entry, never a running sum", () => {
  const e = (topicId: string, completionPct: number, heldOn: string, seq: number, kind: TopicEntryInput["kind"] = "COVERED"): TopicEntryInput => ({ topicId, kind, completionPct, heldOn, seq });
  it("two logs for the same topic on the same day (e.g. a merged session recorded twice) give 50%, not 100%", () => {
    const s = resolveTopicStates([e("T1", 50, "2026-09-07", 1), e("T1", 50, "2026-09-07", 2)]);
    expect(s.get("T1")).toEqual({ kind: "covered", pct: 50 });
  });
  it("40% then 70% on later dates is 70%, regardless of insertion order", () => {
    expect(resolveTopicStates([e("T1", 70, "2026-09-14", 9), e("T1", 40, "2026-09-07", 10)]).get("T1")).toEqual({ kind: "covered", pct: 70 });
  });
  it("leftover entries never change coverage; a later skip wins; a later cover re-instates", () => {
    expect(resolveTopicStates([e("T1", 60, "2026-09-07", 1), e("T1", 0, "2026-09-08", 2, "LEFTOVER")]).get("T1")).toEqual({ kind: "covered", pct: 60 });
    expect(resolveTopicStates([e("T1", 60, "2026-09-07", 1), e("T1", 0, "2026-09-08", 2, "SKIPPED")]).get("T1")).toEqual({ kind: "skipped", pct: 0 });
    expect(resolveTopicStates([e("T1", 0, "2026-09-08", 2, "SKIPPED"), e("T1", 30, "2026-09-09", 3)]).get("T1")).toEqual({ kind: "covered", pct: 30 });
  });
});

describe("cancellations and rescheduling shift the remaining plan", () => {
  const key = (id: string, d: string) => `${id}@${d}`;
  it("cancelling a future Monday (1 h) lowers capacity to 11.5 h: buffer exactly 1.15 is still ON TRACK", () => {
    const r = run({ T1: 100, T2: 50 }, { resolvedKeys: new Set([key("mon", "2026-10-05")]) });
    expect(r).toMatchObject({ availableHours: 11.5, bufferRatio: 1.15, risk: "ON_TRACK" });
  });
  it("cancelling a future Wednesday (1.5 h) drops it to 11 h: buffer 1.10 is TIGHT, and the finish moves later", () => {
    const r = run({ T1: 100, T2: 50 }, { resolvedKeys: new Set([key("wed", "2026-10-07")]) });
    expect(r).toMatchObject({ availableHours: 11, bufferRatio: 1.1, risk: "TIGHT" });
    expect(r.projectedCompletion).toBe("2026-11-04"); // cumulative: 8.5 h on 28 Oct, 9.5 h on 2 Nov, 11 h on 4 Nov (≥ 10 needed)
  });
  it("a make-up session on Fri 9 Oct restores the hours", () => {
    const makeups = makeupOccurrences([{ logId: "L", rescheduledTo: "2026-10-09", startTime: "09:00", endTime: "10:30", hours: 1.5 }], "2026-09-07", "2026-11-08");
    const r = run({ T1: 100, T2: 50 }, { resolvedKeys: new Set([key("wed", "2026-10-07")]), makeups });
    expect(r).toMatchObject({ availableHours: 12.5, bufferRatio: 1.25, risk: "ON_TRACK" });
  });
  it("a cancelled PAST session stays in the historical plan (pace unchanged) but is no longer 'un-logged'", () => {
    const r = run({ T1: 100, T2: 50 }, { resolvedKeys: new Set([key("mon", "2026-09-28")]) });
    expect(r.plannedToDateHours).toBe(10);
    expect(r.paceHours).toBe(-4);
    expect(r.unloggedPastSessions).toBe(7);
  });
  it("a make-up that is itself logged is not counted twice", () => {
    const makeups = makeupOccurrences([{ logId: "L", rescheduledTo: "2026-10-09", startTime: null, endTime: null, hours: 1.5 }], "2026-09-07", "2026-11-08");
    const r = run({ T1: 100, T2: 50 }, { makeups, resolvedKeys: new Set(["makeup:L"]) });
    expect(r.availableHours).toBe(12.5); // the logged make-up is excluded
  });
});

describe("recalculation after timetable changes", () => {
  it("adding a Friday 1 h slot raises capacity to 17.5 h and the planned-so-far to 14 h", () => {
    const fri = { id: "fri", weekday: 5, startTime: "09:00", endTime: "10:00" };
    const withFriday = occurrencesBetween([mon, wed, fri], "2026-09-07", "2026-11-08", ctx);
    const r = run({ T1: 100, T2: 50 }, { baseline: withFriday });
    // Fridays before 5 Oct: 11, 18, 25 Sep, 2 Oct (4 h); from 5 Oct: 9, 16, 23, 30 Oct, 6 Nov (5 h)
    expect(r).toMatchObject({ availableHours: 17.5, bufferRatio: 1.75, plannedToDateHours: 14, paceHours: -8 });
  });
  it("removing the Wednesday slot leaves 5 h: DANGER, with identical results on repeated runs", () => {
    const monOnly = occurrencesBetween([mon], "2026-09-07", "2026-11-08", ctx);
    const a = run({ T1: 100, T2: 50 }, { baseline: monOnly });
    expect(a).toMatchObject({ availableHours: 5, bufferRatio: 0.5, risk: "DANGER" });
    expect(run({ T1: 100, T2: 50 }, { baseline: monOnly })).toEqual(a);
  });
});

describe("classification boundaries and configurable thresholds", () => {
  it("uses the documented defaults at the edges", () => {
    expect(classify(10, 11.5, 16, { onTrack: 1.15, tight: 1 }).risk).toBe("ON_TRACK"); // 1.15
    expect(classify(10, 11.4, 16, { onTrack: 1.15, tight: 1 }).risk).toBe("TIGHT"); // 1.14
    expect(classify(10, 10, 16, { onTrack: 1.15, tight: 1 })).toEqual({ risk: "TIGHT", ratio: 1 });
    expect(classify(10, 9.99, 16, { onTrack: 1.15, tight: 1 }).risk).toBe("TIGHT"); // 0.999 rounds to 1.00
    expect(classify(10, 9.9, 16, { onTrack: 1.15, tight: 1 }).risk).toBe("DANGER"); // 0.99
  });
  it("classifies on the rounded ratio, so 1.1499 displays and classifies as 1.15", () => {
    expect(classify(10, 11.499, 16, { onTrack: 1.15, tight: 1 })).toEqual({ risk: "ON_TRACK", ratio: 1.15 });
  });
  it("honours custom thresholds", () => {
    const strict: Thresholds = { onTrack: 1.3, tight: 1.1 };
    expect(run({ T1: 100, T2: 50 }, { thresholds: strict }).risk).toBe("TIGHT"); // 1.25 < 1.30
    expect(run({ T1: 100, T2: 25 }, { thresholds: strict }).risk).toBe("TIGHT"); // 1.14 ≥ 1.10
    expect(run({ T1: 50 }, { thresholds: strict }).risk).toBe("DANGER");
  });
});

describe("roll-up = worst status, never an average", () => {
  it("one DANGER subject decides, even among many COMPLETE ones", () => {
    expect(worstStatus(["COMPLETE", "ON_TRACK", "DANGER", "COMPLETE"])).toBe("DANGER");
    expect(worstStatus(["ON_TRACK", "TIGHT", "COMPLETE"])).toBe("TIGHT");
    expect(worstStatus(["ON_TRACK", "UNKNOWN"])).toBe("UNKNOWN");
    expect(worstStatus(["COMPLETE", "COMPLETE"])).toBe("COMPLETE");
    expect(worstStatus([])).toBeNull();
  });
});

describe("allocation helper", () => {
  it("lays topics end to end over session hours", () => {
    const occ = occurrencesBetween([mon], "2026-09-07", "2026-09-28", ctx); // four 1 h Mondays
    const a = allocate([{ id: "a", hours: 1.5 }, { id: "b", hours: 2.5 }, { id: "c", hours: 1 }], occ);
    expect(a.get("a")).toEqual({ start: "2026-09-07", end: "2026-09-14" });
    expect(a.get("b")).toEqual({ start: "2026-09-14", end: "2026-09-28" });
    expect(a.get("c")).toEqual({ start: null, end: null }); // 5 h of topics do not fit into 4 h of sessions
  });
});
