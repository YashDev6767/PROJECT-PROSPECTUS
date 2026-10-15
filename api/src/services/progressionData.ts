/** Loads authoritative rows and feeds the pure domain functions. Nothing calculated here is ever stored. */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { CalendarEntryLike } from "../domain/calendar.js";
import type { ISODate } from "../domain/dates.js";
import type { Deadline } from "../domain/deadlines.js";
import { worstStatus, type RiskStatus, type SubjectProgress } from "../domain/progress.js";
import type { TeachingContext } from "../domain/schedule.js";
import { runSubjectEngine } from "../domain/subjectEngine.js";
import { toEntryLike } from "./calendarData.js";
import { iso } from "./format.js";
import type { Settings } from "./settings.js";

const subjectInclude = {
  batch: { include: { semester: true } },
  faculty: true,
  timetable: true,
  units: { orderBy: { position: "asc" as const }, include: { topics: { orderBy: { position: "asc" as const } } } },
  sessions: { include: { topicEntries: true } },
} satisfies Prisma.SubjectInclude;

export type SubjectRow = Prisma.SubjectGetPayload<{ include: typeof subjectInclude }>;
export interface ExamRow { semesterId: string; batchId: string | null; type: "SESSIONAL" | "MID_TERM" | "PUT" | "END_TERM"; startsOn: ISODate; endsOn: ISODate }

export interface SubjectContext { subject: SubjectRow; exams: ExamRow[]; calendar: CalendarEntryLike[] }

/** One query per table for any number of subjects. */
export async function loadSubjectContexts(prisma: PrismaClient, where: Prisma.SubjectWhereInput): Promise<SubjectContext[]> {
  const subjects = await prisma.subject.findMany({ where, include: subjectInclude, orderBy: [{ batch: { name: "asc" } }, { code: "asc" }] });
  if (subjects.length === 0) return [];
  const semesterIds = [...new Set(subjects.map((s) => s.batch.semesterId))];
  const campusIds = [...new Set(subjects.map((s) => s.batch.semester.campusId))];
  const from = subjects.reduce((m, s) => (s.batch.semester.startsOn < m ? s.batch.semester.startsOn : m), subjects[0]!.batch.semester.startsOn);
  const to = subjects.reduce((m, s) => (s.batch.semester.endsOn > m ? s.batch.semester.endsOn : m), subjects[0]!.batch.semester.endsOn);
  const [exams, calendar] = await Promise.all([
    prisma.exam.findMany({ where: { semesterId: { in: semesterIds } } }),
    prisma.calendarEntry.findMany({ where: { OR: [{ campusId: null }, { campusId: { in: campusIds } }], startsOn: { lte: to }, endsOn: { gte: from } } }),
  ]);
  const examRows: ExamRow[] = exams.map((e) => ({ semesterId: e.semesterId, batchId: e.batchId, type: e.type, startsOn: iso(e.startsOn), endsOn: iso(e.endsOn) }));
  return subjects.map((subject) => ({
    subject,
    exams: examRows.filter((e) => e.semesterId === subject.batch.semesterId),
    calendar: calendar.filter((c) => c.campusId === null || c.campusId === subject.batch.semester.campusId).map(toEntryLike),
  }));
}

/** Teaching rules for one batch: calendar + Saturday rule + the exam periods that apply to it. */
export function teachingContextFor(ctx: SubjectContext): TeachingContext {
  const { subject, exams, calendar } = ctx;
  return {
    rule: subject.batch.semester.saturdayRule, calendar,
    examPeriods: exams.filter((e) => e.batchId === null || e.batchId === subject.batchId).map((e) => ({ startsOn: e.startsOn, endsOn: e.endsOn })),
  };
}

export interface SubjectResult {
  subject: { id: string; code: string; name: string; batchId: string; batchName: string; semesterId: string; semesterName: string; campusId: string; track: "MIRAI" | "UNIVERSITY"; facultyId: string | null; facultyName: string | null; isSample: boolean };
  deadline: Deadline;
  referenceDate: ISODate;
  progress: SubjectProgress;
  hoursTaught: number;
  sessionsLogged: number;
  lastLoggedOn: ISODate | null;
  /** Hours the timetable provides from semester start to the last teaching day (derived capacity). */
  teachingCapacityHours: number;
  weeklyHours: number;
}

export function computeSubjectResult(ctx: SubjectContext, asOf: ISODate, settings: Settings): SubjectResult {
  const { subject } = ctx;
  const sem = subject.batch.semester;
  const engine = runSubjectEngine({
    semester: { startsOn: iso(sem.startsOn), endsOn: iso(sem.endsOn), saturdayRule: sem.saturdayRule },
    batchId: subject.batchId,
    slots: subject.timetable.map((t) => ({ id: t.id, weekday: t.weekday, startTime: t.startTime, endTime: t.endTime })),
    topics: subject.units.flatMap((u) => u.topics.map((t) => ({ id: t.id, title: t.title, unitTitle: u.title, plannedHours: t.plannedHours }))),
    logs: subject.sessions.map((l) => ({
      id: l.id, timetableEntryId: l.timetableEntryId, makeupOfId: l.makeupOfId, heldOn: iso(l.heldOn), outcome: l.outcome, rescheduledTo: l.rescheduledTo ? iso(l.rescheduledTo) : null,
      slotStart: l.slotStart, slotEnd: l.slotEnd, scheduledHours: l.scheduledHours, actualHours: l.actualHours, createdAtMs: l.createdAt.getTime(),
      entries: l.topicEntries.map((e) => ({ topicId: e.topicId, kind: e.kind, completionPct: e.completionPct })),
    })),
    exams: ctx.exams.map((e) => ({ batchId: e.batchId, type: e.type, startsOn: e.startsOn, endsOn: e.endsOn })),
    calendar: ctx.calendar, asOf, thresholds: settings.thresholds, deadlineExamType: settings.deadlineExamType,
  });
  return {
    subject: {
      id: subject.id, code: subject.code, name: subject.name, batchId: subject.batchId, batchName: subject.batch.name,
      semesterId: sem.id, semesterName: sem.name, campusId: sem.campusId, track: sem.track,
      facultyId: subject.facultyId, facultyName: subject.faculty?.name ?? null, isSample: subject.isSample,
    },
    ...engine,
  };
}

/* ---------- roll-ups ---------- */
export interface Rollup {
  overall: RiskStatus | null;
  byTrack: Array<{ track: "MIRAI" | "UNIVERSITY"; status: RiskStatus }>;
  byBatch: Array<{ batchId: string; batchName: string; semesterId: string; semesterName: string; track: "MIRAI" | "UNIVERSITY"; status: RiskStatus; subjectCount: number; worstSubject: { id: string; name: string } }>;
}

/** The worst applicable subject decides at every level; an average would hide a failing subject. */
export function rollup(results: SubjectResult[]): Rollup {
  const batches = new Map<string, SubjectResult[]>();
  for (const r of results) batches.set(r.subject.batchId, [...(batches.get(r.subject.batchId) ?? []), r]);
  const byBatch = [...batches.values()].map((rs) => {
    const status = worstStatus(rs.map((r) => r.progress.risk))!;
    const worst = rs.find((r) => r.progress.risk === status)!;
    const s = rs[0]!.subject;
    return { batchId: s.batchId, batchName: s.batchName, semesterId: s.semesterId, semesterName: s.semesterName, track: s.track, status, subjectCount: rs.length, worstSubject: { id: worst.subject.id, name: worst.subject.name } };
  });
  const tracks = [...new Set(results.map((r) => r.subject.track))];
  return {
    overall: worstStatus(results.map((r) => r.progress.risk)),
    byTrack: tracks.map((track) => ({ track, status: worstStatus(results.filter((r) => r.subject.track === track).map((r) => r.progress.risk))! })),
    byBatch,
  };
}

/** Compact row for lists and the dashboard. */
export const summarize = (r: SubjectResult) => ({
  ...r.subject,
  risk: r.progress.risk, headline: r.progress.headline, coveragePct: r.progress.coveragePct,
  hoursInScope: r.progress.hoursInScope, coveredHours: r.progress.coveredHours, remainingHours: r.progress.remainingHours,
  availableHours: r.progress.availableHours, bufferRatio: r.progress.bufferRatio, paceHours: r.progress.paceHours,
  plannedToDateHours: r.progress.plannedToDateHours,
  projectedCompletion: r.progress.projectedCompletion, deadline: r.deadline.date, deadlineLabel: r.deadline.label, lastTeachingDate: r.deadline.lastTeachingDate,
  overdueCount: r.progress.overdueTopics.length, unloggedPastSessions: r.progress.unloggedPastSessions,
  hoursTaught: r.hoursTaught, teachingCapacityHours: r.teachingCapacityHours, weeklyHours: r.weeklyHours,
});
