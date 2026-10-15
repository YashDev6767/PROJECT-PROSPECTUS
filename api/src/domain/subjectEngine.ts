/**
 * Plain-data entry point for the progression engine: everything it needs is passed in, nothing is read from a database,
 * so the very same function serves the API, the sample-data calibration and the unit tests.
 */
import type { CalendarEntryLike, SaturdayRule } from "./calendar.js";
import { addDays, type ISODate } from "./dates.js";
import { pickDeadline, type Deadline } from "./deadlines.js";
import type { ExamType } from "./exams.js";
import { evaluateProgress, resolveTopicStates, type SubjectProgress, type Thresholds, type TopicEntryInput, type TopicInput } from "./progress.js";
import { makeupKey, makeupOccurrences, occurrenceKey, occurrencesBetween, type Slot } from "./schedule.js";
import { countsForCoverage, taughtHours, type Outcome } from "./sessionLogs.js";
import { slotHours } from "./timetable.js";

export interface EngineLog {
  id: string; timetableEntryId: string | null; makeupOfId: string | null; heldOn: ISODate; outcome: Outcome; rescheduledTo: ISODate | null;
  slotStart: string | null; slotEnd: string | null; scheduledHours: number | null; actualHours: number | null; createdAtMs: number;
  entries: Array<{ topicId: string; kind: "COVERED" | "LEFTOVER" | "SKIPPED"; completionPct: number }>;
}
export interface EngineExam { batchId: string | null; type: ExamType; startsOn: ISODate; endsOn: ISODate }

export interface EngineInput {
  semester: { startsOn: ISODate; endsOn: ISODate; saturdayRule: SaturdayRule };
  batchId: string;
  slots: Slot[];
  topics: TopicInput[];
  logs: EngineLog[];
  exams: EngineExam[];
  calendar: CalendarEntryLike[];
  asOf: ISODate;
  thresholds: Thresholds;
  deadlineExamType: ExamType;
}

export interface EngineResult {
  deadline: Deadline; referenceDate: ISODate; progress: SubjectProgress;
  hoursTaught: number; sessionsLogged: number; lastLoggedOn: ISODate | null; teachingCapacityHours: number; weeklyHours: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function runSubjectEngine(i: EngineInput): EngineResult {
  const { startsOn: start, endsOn: end } = i.semester;
  // what-if date clamped to the semester; after the end everything counts as past
  const ref = i.asOf < start ? start : i.asOf > end ? addDays(end, 1) : i.asOf;

  const applicable = i.exams.filter((e) => e.batchId === null || e.batchId === i.batchId);
  const tctx = { rule: i.semester.saturdayRule, calendar: i.calendar, examPeriods: applicable.map((e) => ({ startsOn: e.startsOn, endsOn: e.endsOn })) };
  const deadline = pickDeadline(i.exams, i.batchId, end, i.deadlineExamType);
  const windowEnd = deadline.lastTeachingDate < end ? deadline.lastTeachingDate : end;
  const baseline = occurrencesBetween(i.slots, start, windowEnd, tctx);
  const afterDeadline = windowEnd < end ? occurrencesBetween(i.slots, addDays(windowEnd, 1), end, tctx) : [];

  // time travel: logs after the reference date do not exist yet as far as this calculation is concerned
  const logs = i.logs.filter((l) => l.heldOn <= ref);
  const resolvedKeys = new Set<string>();
  for (const l of logs) {
    if (l.timetableEntryId) resolvedKeys.add(occurrenceKey(l.timetableEntryId, l.heldOn));
    if (l.makeupOfId) resolvedKeys.add(makeupKey(l.makeupOfId));
  }
  const rescheduled = logs.filter((l) => l.outcome === "CANCELLED" && l.rescheduledTo)
    .map((l) => ({ logId: l.id, rescheduledTo: l.rescheduledTo!, startTime: l.slotStart, endTime: l.slotEnd, hours: l.scheduledHours ?? 0 }));
  const makeups = makeupOccurrences(rescheduled, start, windowEnd);

  const entries: TopicEntryInput[] = logs.filter((l) => countsForCoverage(l.outcome))
    .flatMap((l) => l.entries.map((e) => ({ topicId: e.topicId, kind: e.kind, completionPct: e.completionPct, heldOn: l.heldOn, seq: l.createdAtMs })));

  const progress = evaluateProgress({
    topics: i.topics, states: resolveTopicStates(entries), baseline, makeups, resolvedKeys, afterDeadline, referenceDate: ref,
    deadlineLabel: deadline.label, lastTeachingDate: deadline.lastTeachingDate, thresholds: i.thresholds,
  });
  const last = [...logs].sort((a, b) => b.heldOn.localeCompare(a.heldOn))[0];
  return {
    deadline, referenceDate: ref, progress,
    hoursTaught: r2(logs.reduce((n, l) => n + taughtHours(l), 0)),
    sessionsLogged: logs.filter((l) => countsForCoverage(l.outcome)).length,
    lastLoggedOn: last?.heldOn ?? null,
    teachingCapacityHours: r2(baseline.reduce((n, o) => n + o.hours, 0)),
    weeklyHours: r2(i.slots.reduce((n, s) => n + slotHours(s.startTime, s.endTime), 0)),
  };
}
