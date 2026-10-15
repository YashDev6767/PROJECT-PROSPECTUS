import { runSubjectEngine, type EngineLog } from "../domain/subjectEngine.js";
import { DEFAULT_THRESHOLDS } from "../domain/progress.js";
import type { buildSampleData } from "./sample.js";

type Sample = ReturnType<typeof buildSampleData>;

/** Runs the real engine over sample data (no database), for calibration tests and demos. */
export function evaluateSample(d: Sample, subjectId: string, asOf: string) {
  const subject = d.subjects.find((s) => s.id === subjectId)!;
  const batch = d.batches.find((b) => b.id === subject.batchId)!;
  const sem = d.semesters.find((s) => s.id === batch.semesterId)!;
  const logs: EngineLog[] = d.sessionLogs.filter((l) => l.subjectId === subjectId).map((l, i) => ({
    id: l.id, timetableEntryId: l.timetableEntryId, makeupOfId: l.makeupOfId, heldOn: l.heldOn, outcome: l.outcome, rescheduledTo: l.rescheduledTo,
    slotStart: l.slotStart, slotEnd: l.slotEnd, scheduledHours: l.scheduledHours, actualHours: null, createdAtMs: i,
    entries: d.topicEntries.filter((e) => e.sessionLogId === l.id).map((e) => ({ topicId: e.topicId, kind: e.kind, completionPct: e.completionPct })),
  }));
  return runSubjectEngine({
    semester: sem, batchId: batch.id, slots: d.timetable.filter((t) => t.subjectId === subjectId),
    topics: d.units.filter((u) => u.subjectId === subjectId).sort((a, b) => a.position - b.position).flatMap((u) => d.topics.filter((t) => t.unitId === u.id).sort((a, b) => a.position - b.position).map((t) => ({ id: t.id, title: t.title, unitTitle: u.title, plannedHours: t.plannedHours }))),
    logs, exams: d.exams.filter((e) => e.semesterId === sem.id), calendar: d.calendar.filter((c) => c.campusId === null || c.campusId === sem.campusId),
    asOf, thresholds: DEFAULT_THRESHOLDS, deadlineExamType: "END_TERM",
  });
}
