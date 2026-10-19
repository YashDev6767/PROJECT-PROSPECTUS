import { describe, expect, it } from "vitest";
import { carryForwardFor, type CarryLog } from "./carryForward.js";

// Syllabus: T1 4 h, T2 4 h, T3 2 h, T4 2 h
const topics = [
  { id: "t1", title: "T1", unitTitle: "U1", plannedHours: 4 }, { id: "t2", title: "T2", unitTitle: "U1", plannedHours: 4 },
  { id: "t3", title: "T3", unitTitle: "U2", plannedHours: 2 }, { id: "t4", title: "T4", unitTitle: "U2", plannedHours: 2 },
];
let n = 0;
const log = (heldOn: string, outcome: CarryLog["outcome"], entries: CarryLog["entries"] = [], extra: Partial<CarryLog> = {}): CarryLog => ({ id: `l${++n}`, heldOn, createdAtMs: n, outcome, carryForward: null, entries, ...extra });
const cov = (topicId: string, completionPct: number) => ({ topicId, kind: "COVERED" as const, completionPct });
const left = (topicId: string) => ({ topicId, kind: "LEFTOVER" as const, completionPct: 0 });
const skip = (topicId: string) => ({ topicId, kind: "SKIPPED" as const, completionPct: 0 });
const ids = (r: ReturnType<typeof carryForwardFor>) => r.items.map((i) => i.topicId);

describe("carry-forward eligibility (hand-calculated)", () => {
  it("offers a partly covered topic and a leftover topic from the previous session, with remaining hours", () => {
    const logs = [log("2026-10-05", "IN_PROGRESS", [cov("t1", 100), cov("t2", 50), left("t3")])];
    const r = carryForwardFor({ logs, topics, heldOn: "2026-10-07" });
    expect(r.source).toEqual({ logId: logs[0]!.id, heldOn: "2026-10-05", outcome: "IN_PROGRESS" });
    expect(r.items).toEqual([
      expect.objectContaining({ topicId: "t2", reason: "in_progress", completionPct: 50, remainingHours: 2, plannedHours: 4, fromDate: "2026-10-05" }), // 4 h × (1 − 0.5)
      expect.objectContaining({ topicId: "t3", reason: "leftover", completionPct: 0, remainingHours: 2, fromDate: "2026-10-05" }),
    ]);
  });
  it("never offers completed topics, and offers nothing when the previous session finished everything it touched", () => {
    const r = carryForwardFor({ logs: [log("2026-10-05", "COMPLETED", [cov("t1", 100), cov("t2", 100)])], topics, heldOn: "2026-10-07" });
    expect(r.items).toEqual([]);
    expect(r.source).not.toBeNull();
  });
  it("drops an item a later session already finished, or that was explicitly skipped later (latest entry wins)", () => {
    const logs = [
      log("2026-10-05", "IN_PROGRESS", [cov("t1", 40), cov("t2", 30), left("t3"), left("t4")]),
      log("2026-10-06", "IN_PROGRESS", [cov("t1", 100), skip("t3")]), // t1 finished, t3 skipped on the 6th
    ];
    // source = the 6th (latest teaching log); it carries only what IT left: nothing partial/leftover
    expect(ids(carryForwardFor({ logs, topics, heldOn: "2026-10-08" }))).toEqual([]);
    // but if the 6th kept t2 unfinished it is offered with the CURRENT state (30%), not a stale one
    logs.push(log("2026-10-07", "IN_PROGRESS", [left("t2"), left("t3")]));
    const r = carryForwardFor({ logs, topics, heldOn: "2026-10-09" });
    expect(ids(r)).toEqual(["t2"]); // t3 skipped on the 6th stays excluded
    expect(r.items[0]).toMatchObject({ completionPct: 30, remainingHours: 2.8 }); // 4 h × 0.7
  });
  it("cancelled and skipped sessions are passed over: the last TEACHING session is still the source", () => {
    const logs = [
      log("2026-10-05", "IN_PROGRESS", [cov("t1", 60), left("t2")]),
      log("2026-10-07", "CANCELLED", [], { carryForward: "ignored" }),
      log("2026-10-09", "SKIPPED"),
    ];
    const r = carryForwardFor({ logs, topics, heldOn: "2026-10-12" });
    expect(r.source?.heldOn).toBe("2026-10-05");
    expect(ids(r)).toEqual(["t1", "t2"]);
    expect(r.note).toBeNull(); // the cancelled log's text is not a source
  });
  it("a merged session is a teaching source like any other", () => {
    expect(ids(carryForwardFor({ logs: [log("2026-10-05", "MERGED", [cov("t3", 50)])], topics, heldOn: "2026-10-07" }))).toEqual(["t3"]);
  });
  it("with no earlier teaching session there is nothing to offer", () => {
    expect(carryForwardFor({ logs: [], topics, heldOn: "2026-10-07" })).toEqual({ source: null, items: [], note: null });
    expect(carryForwardFor({ logs: [log("2026-10-05", "CANCELLED"), log("2026-10-06", "SKIPPED")], topics, heldOn: "2026-10-07" }).items).toEqual([]);
  });
  it("ignores logs on or after the session date and the log being edited (editing never offers its own work)", () => {
    const earlier = log("2026-10-05", "IN_PROGRESS", [cov("t1", 50)]);
    const same = log("2026-10-07", "IN_PROGRESS", [cov("t2", 20), left("t3")]);
    const later = log("2026-10-09", "IN_PROGRESS", [left("t4")]);
    const r = carryForwardFor({ logs: [earlier, same, later], topics, heldOn: "2026-10-07", excludeLogId: same.id });
    expect(r.source?.logId).toBe(earlier.id);
    expect(ids(r)).toEqual(["t1"]);
  });
  it("lists each topic once, in syllabus order, and ignores topics that left the syllabus; the previous note is passed along", () => {
    const l = log("2026-10-05", "IN_PROGRESS", [left("t3"), cov("t1", 25), { topicId: "gone", kind: "LEFTOVER", completionPct: 0 }], { carryForward: "  Finish the proof  " });
    const r = carryForwardFor({ logs: [l], topics, heldOn: "2026-10-07" });
    expect(ids(r)).toEqual(["t1", "t3"]);
    expect(r.note).toBe("Finish the proof");
  });
});
