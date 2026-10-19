/** Exam readiness from persisted exams, timetable, calendar, syllabus and session logs. Nothing here is stored or scored. */
import type { PrismaClient } from "@prisma/client";
import { addDays, daysBetweenISO, type ISODate } from "../domain/dates.js";
import { examPhase, examStatus, scopeModeFor, topicInExamScope } from "../domain/examReadiness.js";
import { examTypeLabels } from "../domain/exams.js";
import type { Track } from "../domain/semesters.js";
import { dbDate, iso } from "./format.js";
import { computeSubjectResult, loadSubjectContexts } from "./progressionData.js";
import type { Settings } from "./settings.js";

export type ExamReadinessState = "ready" | "no_active_semester" | "no_exams";

export async function buildExamReadiness(prisma: PrismaClient, q: { campusId: string; track?: Track | undefined; semesterId?: string | undefined; asOf: ISODate; /** only exams and subjects that apply to this batch (the student portal) */ batchId?: string | undefined; /** also list the in-scope topics of each subject */ includeTopics?: boolean }, settings: Settings) {
  const semesterWhere = q.semesterId
    ? { id: q.semesterId, campusId: q.campusId }
    : { campusId: q.campusId, track: q.track, isActive: true, startsOn: { lte: dbDate(q.asOf) }, endsOn: { gte: dbDate(q.asOf) } };
  const semesters = await prisma.semester.findMany({ where: semesterWhere });
  const base = { asOf: q.asOf, campusId: q.campusId, thresholds: settings.thresholds };
  if (semesters.length === 0) {
    return { ...base, state: "no_active_semester" as ExamReadinessState, message: "No semester is active for this campus today, so there are no exams to prepare for. Activate the current semester under Semesters.", exams: [] };
  }

  const exams = await prisma.exam.findMany({
    where: { semesterId: { in: semesters.map((s) => s.id) }, endsOn: { gte: dbDate(q.asOf) }, ...(q.batchId ? { OR: [{ batchId: null }, { batchId: q.batchId }] } : {}) },
    include: { semester: true, batch: true }, orderBy: [{ startsOn: "asc" }, { name: "asc" }],
  });
  if (exams.length === 0) {
    return { ...base, state: "no_exams" as ExamReadinessState, message: "No upcoming exams are configured for the active semester. Add them under Exam Schedule.", exams: [] };
  }

  const contexts = await loadSubjectContexts(prisma, { batchId: q.batchId, batch: { semesterId: { in: semesters.map((s) => s.id) } } });
  const out = exams.map((e) => {
    const startsOn = iso(e.startsOn), endsOn = iso(e.endsOn);
    const deadline = { date: startsOn, lastTeachingDate: addDays(startsOn, -1), source: "exam" as const, examType: e.type, label: `${e.name} starts ${startsOn}` };
    const applicable = contexts.filter((c) => c.subject.batch.semesterId === e.semesterId && (e.batchId === null || c.subject.batchId === e.batchId));
    const subjects = applicable.map((ctx) => {
      const allTopics = ctx.subject.units.flatMap((u) => u.topics);
      const mode = scopeModeFor(allTopics);
      const r = computeSubjectResult(ctx, q.asOf, settings, { deadline, topicFilter: (t) => topicInExamScope(mode, e.type, t.examScope) });
      const p = r.progress;
      return {
        subjectId: r.subject.id, code: r.subject.code, name: r.subject.name, batchName: r.subject.batchName, facultyName: r.subject.facultyName, isSample: r.subject.isSample,
        status: p.risk, headline: p.headline, reasons: p.reasons.slice(0, 3),
        scopeMode: mode, topicsInScope: p.topics.filter((t) => t.status !== "skipped").length, unscopedTopics: mode === "exam_scope" ? allTopics.filter((t) => t.examScope === null).length : 0,
        hoursInScope: p.hoursInScope, coveredHours: p.coveredHours, remainingHours: p.remainingHours, coveragePct: p.coveragePct,
        availableHours: p.availableHours, bufferRatio: p.bufferRatio, projectedCompletion: p.projectedCompletion, unloggedPastSessions: p.unloggedPastSessions,
        ...(q.includeTopics ? { scopeTopics: p.topics.filter((t) => t.status !== "skipped").map((t) => ({ title: t.title, unitTitle: t.unitTitle, completionPct: t.completionPct })) } : {}),
      };
    }).sort((a, b) => (a.bufferRatio ?? 99) - (b.bufferRatio ?? 99) || a.name.localeCompare(b.name));
    const status = examStatus(subjects.map((s) => s.status));
    const unassessed = subjects.filter((s) => s.status === "UNKNOWN").length;
    return {
      id: e.id, name: e.name, type: e.type, typeLabel: examTypeLabels[e.type], startsOn, endsOn, daysToStart: daysBetweenISO(q.asOf, startsOn), phase: examPhase(q.asOf, startsOn),
      lastTeachingDate: deadline.lastTeachingDate, notes: e.notes, isSample: e.isSample,
      semester: { id: e.semesterId, name: e.semester.name, track: e.semester.track }, batch: e.batch ? { id: e.batch.id, name: e.batch.name } : null,
      status, subjectCount: subjects.length, unassessed,
      note: subjects.length === 0 ? "This exam applies to a batch that has no subjects yet." : unassessed > 0 ? `${unassessed} of ${subjects.length} subject(s) cannot be assessed yet (no syllabus hours in scope).` : null,
      subjects,
    };
  });
  return { ...base, state: "ready" as ExamReadinessState, message: "", exams: out };
}
