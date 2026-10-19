/**
 * Student learning portal data for ONE batch. Everything is read-only and comes from the same engine as the dashboard
 * (hour-weighted coverage, the planned timetable, exam readiness) — nothing is recomputed or invented here, and nothing
 * faculty- or admin-facing (faculty names, buffer ratios, review state, internal ids shown to users) is included.
 */
import type { PrismaClient } from "@prisma/client";
import { addDays, type ISODate } from "../domain/dates.js";
import type { RiskStatus } from "../domain/progress.js";
import { examTypeLabels } from "../domain/exams.js";
import { buildExamReadiness } from "./examReadiness.js";
import { iso } from "./format.js";
import { computeSubjectResult, loadSubjectContexts } from "./progressionData.js";
import { sessionsInRange } from "./scheduleData.js";
import type { Settings } from "./settings.js";

/** Plain-language status for students (the staff-facing buffer ratio and risk jargon stay out of this view). */
export const studentStatus = (r: RiskStatus): { key: "on_track" | "keep_an_eye" | "needs_attention" | "complete" | "no_data"; label: string } =>
  r === "DANGER" ? { key: "needs_attention", label: "Needs attention" } : r === "TIGHT" ? { key: "keep_an_eye", label: "Keep an eye on this" }
    : r === "COMPLETE" ? { key: "complete", label: "Complete" } : r === "ON_TRACK" ? { key: "on_track", label: "On track" } : { key: "no_data", label: "Not enough information yet" };

export async function buildStudentPortal(prisma: PrismaClient, batchId: string, today: ISODate, settings: Settings) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, include: { semester: true } });
  if (!batch) return null;
  const sem = batch.semester;
  const contexts = await loadSubjectContexts(prisma, { batchId });
  const results = contexts.map((c) => computeSubjectResult(c, today, settings));

  const subjects = results.map((r) => {
    const p = r.progress;
    const live = p.topics.filter((t) => t.status !== "skipped");
    return {
      id: r.subject.id, code: r.subject.code, name: r.subject.name,
      status: studentStatus(p.risk), coveragePct: p.coveragePct, hoursInScope: p.hoursInScope, coveredHours: p.coveredHours, remainingHours: p.remainingHours,
      coveredTopics: live.filter((t) => t.status === "completed" || t.status === "in_progress").map((t) => ({ title: t.title, unitTitle: t.unitTitle, completionPct: t.completionPct })),
      upcomingTopics: live.filter((t) => t.status !== "completed").slice(0, 6).map((t) => ({ title: t.title, unitTitle: t.unitTitle, completionPct: t.completionPct, expectedBy: t.forecastEnd })),
    };
  });
  const withScope = results.filter((r) => r.progress.hoursInScope > 0);
  const scope = withScope.reduce((n, r) => n + r.progress.hoursInScope, 0);
  const covered = withScope.reduce((n, r) => n + r.progress.coveredHours, 0);

  const { items } = await sessionsInRange(prisma, { from: today, to: addDays(today, 14), campusId: sem.campusId, track: sem.track, batchId });
  const upcomingClasses = items.filter((i) => i.log === null).slice(0, 8).map((i) => ({ date: i.date, startTime: i.startTime, endTime: i.endTime, subjectName: i.subjectName, subjectCode: i.subjectCode, room: i.room, kind: i.kind }));

  const er = await buildExamReadiness(prisma, { campusId: sem.campusId, semesterId: sem.id, asOf: today, batchId, includeTopics: true }, settings);
  const exams = er.exams.map((e) => ({
    id: e.id, name: e.name, typeLabel: examTypeLabels[e.type], startsOn: e.startsOn, endsOn: e.endsOn, daysToStart: e.daysToStart, phase: e.phase, classesEnd: e.lastTeachingDate,
    subjects: e.subjects.map((s) => ({
      name: s.name, code: s.code, status: studentStatus(s.status), coveragePct: s.coveragePct, remainingHours: s.remainingHours, teachingHoursLeft: s.availableHours,
      scope: s.scopeMode === "exam_scope" ? "These topics are assessed in this exam" : "The whole syllabus (topics have not been tagged to exams yet)",
      scopeTopics: (s as { scopeTopics?: Array<{ title: string; unitTitle: string; completionPct: number }> }).scopeTopics ?? [],
    })),
  }));

  return {
    asOf: today,
    batch: { id: batch.id, name: batch.name },
    campusId: sem.campusId, track: sem.track,
    semester: { name: sem.name, startsOn: iso(sem.startsOn), endsOn: iso(sem.endsOn) },
    overview: {
      subjectCount: subjects.length, assessedSubjects: withScope.length,
      overallCoveragePct: scope > 0 ? Math.round((covered / scope) * 1000) / 10 : null,
      coveredHours: Math.round(covered * 100) / 100, hoursInScope: Math.round(scope * 100) / 100,
      needAttention: results.filter((r) => r.progress.risk === "DANGER" || r.progress.risk === "TIGHT").length,
    },
    subjects, upcomingClasses, exams,
  };
}
