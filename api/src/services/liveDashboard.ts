/** Dashboard computed from persisted timetable, session logs, syllabus and exams — no demo numbers. */
import type { PrismaClient } from "@prisma/client";
import { campuses } from "../data/campuses.js";
import { timeInZone } from "../domain/clock.js";
import { daysBetweenISO as daysBetween, type ISODate } from "../domain/dates.js";
import type { Dashboard, SubjectRow } from "../domain/dashboard.js";
import { examTypeLabels } from "../domain/exams.js";
import { riskRank } from "../domain/progress.js";
import { taughtHours } from "../domain/sessionLogs.js";
import { dbDate, iso } from "./format.js";
import { computeSubjectResult, loadSubjectContexts, rollup } from "./progressionData.js";
import { sessionsInRange } from "./scheduleData.js";
import { logInclude, serializeLog } from "./sessionLogData.js";
import type { Settings } from "./settings.js";

const trackNames = { MIRAI: "Mirai", UNIVERSITY: "University" } as const;

/** Returns null when the campus has no semesters at all, so the caller can fall back to the labelled demo dataset. */
export async function buildLiveDashboard(prisma: PrismaClient, campusId: string, now: Date, today: ISODate, settings: Settings): Promise<Dashboard | null> {
  const campus = campuses.find((c) => c.id === campusId);
  if (!campus) return null;
  if ((await prisma.semester.count({ where: { campusId } })) === 0) return null;

  const active = await prisma.semester.findMany({ where: { campusId, isActive: true, startsOn: { lte: dbDate(today) }, endsOn: { gte: dbDate(today) } } });
  const semesterIds = active.map((s) => s.id);
  const contexts = await loadSubjectContexts(prisma, { batch: { semesterId: { in: semesterIds } } });
  const results = contexts.map((c) => computeSubjectResult(c, today, settings));
  const roll = rollup(results);

  const withScope = results.filter((r) => r.progress.hoursInScope > 0);
  const scope = withScope.reduce((n, r) => n + r.progress.hoursInScope, 0);
  const covered = withScope.reduce((n, r) => n + r.progress.coveredHours, 0);

  const atRisk: SubjectRow[] = results
    .filter((r) => r.progress.risk === "DANGER" || r.progress.risk === "TIGHT")
    .sort((a, b) => riskRank[a.progress.risk] - riskRank[b.progress.risk] || (a.progress.bufferRatio ?? 0) - (b.progress.bufferRatio ?? 0))
    .map((r) => ({
      id: r.subject.id, code: r.subject.code, name: r.subject.name, faculty: r.subject.facultyName ?? "Unassigned", batchName: r.subject.batchName,
      coveragePct: r.progress.coveragePct ?? 0,
      expectedPct: r.progress.hoursInScope > 0 ? Math.round((r.progress.plannedToDateHours / r.progress.hoursInScope) * 1000) / 10 : 0,
      hoursBehind: Math.max(0, -r.progress.paceHours), risk: r.progress.risk === "DANGER" ? "critical" : "at_risk",
      daysToExam: daysBetween(today, r.deadline.date), status: r.progress.risk, reason: r.progress.headline, bufferRatio: r.progress.bufferRatio, track: trackNames[r.subject.track],
      remainingHours: r.progress.remainingHours, availableHours: r.progress.availableHours, deadline: r.deadline.date,
    }));

  const { items } = await sessionsInRange(prisma, { from: today, to: today, campusId });
  const nowTime = timeInZone(now, settings.timeZone);
  const schedule = items.map((i) => ({
    id: i.key, subject: i.subjectName, code: i.batchName, start: i.startTime, end: i.endTime, room: i.room ?? "—", subjectId: i.subjectId,
    state: i.log ? ("logged" as const) : i.endTime <= nowTime ? ("needs_log" as const) : ("upcoming" as const), ...(i.log ? { outcome: i.log.outcome } : {}),
  }));

  const exams = await prisma.exam.findMany({ where: { semester: { campusId, id: { in: semesterIds } }, startsOn: { gte: dbDate(today) } }, include: { semester: true, batch: true }, orderBy: { startsOn: "asc" }, take: 6 });
  const recent = await prisma.sessionLog.findMany({ where: { subject: { batch: { semester: { campusId } } }, heldOn: { lte: dbDate(today) } }, include: logInclude, orderBy: [{ heldOn: "desc" }, { createdAt: "desc" }], take: 5 });

  const worst = roll.overall ? results.find((r) => r.progress.risk === roll.overall) : null;
  return {
    dataSource: "live", generatedAt: now.toISOString(), campuses: campuses.map((c) => ({ id: c.id, name: c.name })),
    context: { campus: { id: campus.id, name: campus.name }, semester: active.length ? active.map((s) => `${s.name} (${trackNames[s.track]})`).join(" · ") : "No active semester", today },
    overall: { status: roll.overall, worstSubject: worst ? { id: worst.subject.id, name: worst.subject.name, batchName: worst.subject.batchName } : null, byTrack: roll.byTrack },
    metrics: {
      overallCoveragePct: scope > 0 ? Math.round((covered / scope) * 1000) / 10 : 0,
      hoursBehind: Math.round(results.reduce((n, r) => n + Math.max(0, -r.progress.paceHours), 0) * 10) / 10,
      subjectsAtRisk: atRisk.length,
      nextExamInDays: exams[0] ? daysBetween(today, iso(exams[0].startsOn)) : null,
    },
    schedule, atRisk,
    exams: exams.map((e) => ({ id: e.id, name: e.name, examDate: iso(e.startsOn), daysToExam: daysBetween(today, iso(e.startsOn)), subtitle: `${examTypeLabels[e.type]} · ${trackNames[e.semester.track]} · ${e.batch?.name ?? "whole cohort"}` })),
    recentSessions: recent.map((l) => {
      const s = serializeLog(l);
      return {
        id: l.id, subject: s.subjectName, code: s.batchName, faculty: s.facultyName ?? "—", hours: taughtHours({ outcome: l.outcome, actualHours: l.actualHours, scheduledHours: l.scheduledHours }), date: s.heldOn,
        topics: s.covered.length ? s.covered.map((t) => `${t.title}${t.completionPct < 100 ? ` (${t.completionPct}%)` : ""}`).join(", ") : `${l.outcome.replace("_", " ").toLowerCase()}${l.notes ? ` — ${l.notes}` : ""}`,
      };
    }),
  };
}
