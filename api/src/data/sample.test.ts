import { describe, expect, it } from "vitest";
import { campuses } from "./campuses.js";
import { buildSampleData } from "./sample.js";
import { describeMonth, type CalendarEntryLike } from "../domain/calendar.js";
import { validateExamDates, findExamOverlaps } from "../domain/exams.js";
import { findSemesterOverlaps } from "../domain/semesters.js";
import { findConflicts, validateSlot, type SlotRow } from "../domain/timetable.js";
import { evaluateSample } from "./evaluateSample.js";
import { SAMPLE_LOG_CUTOFF } from "./sample.js";
import { validateSyllabus } from "../domain/syllabus.js";

const d = buildSampleData();
const unique = (ids: string[]) => new Set(ids).size === ids.length;

describe("sample data consistency", () => {
  it("covers all four campuses and both tracks with at least two semesters", () => {
    expect(new Set(d.semesters.map((s) => s.campusId))).toEqual(new Set(campuses.map((c) => c.id)));
    expect(new Set(d.semesters.map((s) => s.track))).toEqual(new Set(["MIRAI", "UNIVERSITY"]));
    expect(d.semesters.length).toBeGreaterThanOrEqual(2);
  });

  it("uses unique deterministic ids (so re-seeding cannot duplicate)", () => {
    for (const rows of Object.values(d)) expect(unique(rows.map((r) => r.id))).toBe(true);
    expect(JSON.stringify(buildSampleData())).toBe(JSON.stringify(d));
  });

  it("has no overlapping semesters per campus and track, and valid exam dates and overlaps", () => {
    for (const s of d.semesters) expect(findSemesterOverlaps(s, d.semesters.filter((o) => o !== s))).toEqual([]);
    for (const e of d.exams) {
      const sem = d.semesters.find((s) => s.id === e.semesterId)!;
      expect(validateExamDates(e, sem)).toEqual([]);
      expect(findExamOverlaps(e, d.exams)).toEqual([]);
    }
  });

  it("has a conflict-free timetable with valid slots", () => {
    const rows: SlotRow[] = d.timetable.map((t) => {
      const sub = d.subjects.find((s) => s.id === t.subjectId)!;
      const batch = d.batches.find((b) => b.id === sub.batchId)!;
      expect(validateSlot(t.startTime, t.endTime)).toBeNull();
      return { id: t.id, weekday: t.weekday, startTime: t.startTime, endTime: t.endTime, batchId: batch.id, batchName: batch.name, facultyId: sub.facultyId, facultyName: sub.facultyId, subjectName: sub.name };
    });
    // faculty and batch ids are unique per campus, so one global pass covers every campus and both tracks
    for (const row of rows) expect(findConflicts(row, rows), row.id).toEqual([]);
  });

  it("gives every scheduled subject realistic capacity: the timetable covers the plan with room to spare, and the syllabus matches the plan", () => {
    for (const sub of d.subjects.filter((s) => d.timetable.some((t) => t.subjectId === s.id))) {
      const r = evaluateSample(d, sub.id, "2026-08-03");
      expect(r.teachingCapacityHours, sub.id).toBeGreaterThanOrEqual(sub.plannedHours * 1.1); // at least a 1.1 buffer before any cancellations
      expect(r.teachingCapacityHours, sub.id).toBeLessThan(sub.plannedHours * 2);
      const units = d.units.filter((u) => u.subjectId === sub.id).map((u) => ({ title: u.title, topics: d.topics.filter((t) => t.unitId === u.id).map((t) => ({ title: t.title, plannedHours: t.plannedHours, examScope: t.examScope })) }));
      expect(validateSyllabus(units)).toEqual([]);
      expect(units.flatMap((u) => u.topics).reduce((n, t) => n + t.plannedHours, 0)).toBe(sub.plannedHours);
    }
  });

  it("includes special working days and holidays that the calendar rules honour", () => {
    const hitech = d.calendar.filter((c) => c.campusId === null || c.campusId === "hi-tech");
    const oct = describeMonth("2026-10", "SECOND_FOURTH", hitech);
    expect(oct.find((x) => x.date === "2026-10-31")).toMatchObject({ working: true, reason: "special_working_day" });
    expect(oct.find((x) => x.date === "2026-10-02")).toMatchObject({ working: false, reason: "holiday" });
  });
});

describe("sample session logs", () => {
  it("never double-logs a scheduled session and stays inside each semester and before the cut-off", () => {
    const keys = d.sessionLogs.map((l) => `${l.timetableEntryId}@${l.heldOn}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const l of d.sessionLogs) {
      const sem = d.semesters.find((s) => s.id === d.batches.find((b) => b.id === d.subjects.find((x) => x.id === l.subjectId)!.batchId)!.semesterId)!;
      expect(l.heldOn >= sem.startsOn && l.heldOn <= sem.endsOn && l.heldOn <= SAMPLE_LOG_CUTOFF, l.id).toBe(true);
    }
  });

  it("only records topics on sessions that taught something, with percentages in range and never decreasing over time", () => {
    const last = new Map<string, number>();
    for (const l of [...d.sessionLogs].sort((a, b) => a.heldOn.localeCompare(b.heldOn))) {
      const entries = d.topicEntries.filter((e) => e.sessionLogId === l.id);
      if (l.outcome === "CANCELLED") expect(entries).toEqual([]);
      for (const e of entries) {
        expect(e.completionPct).toBeGreaterThanOrEqual(1);
        expect(e.completionPct).toBeLessThanOrEqual(100);
        expect(e.completionPct, `${l.id} ${e.topicId}`).toBeGreaterThanOrEqual(last.get(e.topicId) ?? 0);
        last.set(e.topicId, e.completionPct);
      }
    }
  });

  it("includes a merged session (same date, same faculty) and a rescheduled cancellation", () => {
    const merged = d.sessionLogs.find((l) => l.outcome === "MERGED")!;
    const primary = d.sessionLogs.find((l) => l.id === merged.mergedIntoId)!;
    expect(primary.heldOn).toBe(merged.heldOn);
    expect(d.subjects.find((s) => s.id === primary.subjectId)!.facultyId).toBe(d.subjects.find((s) => s.id === merged.subjectId)!.facultyId);
    const resched = d.sessionLogs.find((l) => l.outcome === "CANCELLED" && l.rescheduledTo)!;
    expect(resched.rescheduledTo! > SAMPLE_LOG_CUTOFF).toBe(true);
  });

  it("shows every risk status — a realistic mix, not everything critical", () => {
    const counts: Record<string, number> = {};
    for (const s of d.subjects) { const r = evaluateSample(d, s.id, "2026-10-16").progress.risk; counts[r] = (counts[r] ?? 0) + 1; }
    for (const status of ["ON_TRACK", "TIGHT", "DANGER", "COMPLETE", "UNKNOWN"]) expect(counts[status], status).toBeGreaterThan(0);
    expect(counts.DANGER!).toBeLessThan(d.subjects.length * 0.35);
    expect(counts.ON_TRACK!).toBeGreaterThan(counts.DANGER!);
  });

  it("the completed semester evaluates as COMPLETE without a stale 'un-logged sessions' warning", () => {
    const r = evaluateSample(d, "sample-subj-sample-batch-hi-tech-mirai-a-s2-smp101", "2026-10-16");
    expect(r.progress.risk).toBe("COMPLETE");
    expect(r.progress.reasons.join(" ")).not.toMatch(/no log/);
  });
});
