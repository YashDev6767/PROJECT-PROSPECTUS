/**
 * Service layer for Reports (Phase 11).
 * Loads authoritative database rows using Prisma and feeds the pure reports domain module.
 * Never invents metrics or fabricates numbers.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { campuses, type CampusId } from "../data/campuses.js";
import type { ISODate } from "../domain/dates.js";
import { occurrencesBetween } from "../domain/schedule.js";
import {
  buildCampusTrackReport,
  buildCourseProgressReport,
  buildFacultyActivityReport,
  buildTeachingDeliveryReport,
  type CampusTrackSummaryReportItem,
  type CampusTrackSummarySummary,
  type CourseProgressReportItem,
  type CourseProgressSummary,
  type ExamReadinessReportItem,
  type ExamReadinessReportSummary,
  type FacultyActivityInput,
  type FacultyActivityReportItem,
  type FacultyActivitySummary,
  type TeachingDeliveryInputSubject,
  type TeachingDeliveryReportItem,
  type TeachingDeliverySummary,
} from "../domain/reports.js";
import { dbDate, iso } from "./format.js";
import { buildExamReadiness } from "./examReadiness.js";
import { computeSubjectResult, loadSubjectContexts, teachingContextFor } from "./progressionData.js";
import type { Settings } from "./settings.js";

export interface ReportFilter {
  campusId?: string | undefined;
  track?: "MIRAI" | "UNIVERSITY" | undefined;
  semesterId?: string | undefined;
  batchId?: string | undefined;
  subjectId?: string | undefined;
  facultyId?: string | undefined;
  from?: ISODate | undefined;
  to?: ISODate | undefined;
}

export async function fetchCourseProgressReport(
  prisma: PrismaClient,
  filter: ReportFilter,
  settings: Settings,
  asOf: ISODate,
): Promise<{ items: CourseProgressReportItem[]; summary: CourseProgressSummary }> {
  const where: Prisma.SubjectWhereInput = {
    id: filter.subjectId,
    facultyId: filter.facultyId,
    batchId: filter.batchId,
    batch: {
      semesterId: filter.semesterId,
      semester: {
        campusId: filter.campusId,
        track: filter.track,
      },
    },
  };

  const contexts = await loadSubjectContexts(prisma, where);
  const results = contexts.map((ctx) => computeSubjectResult(ctx, asOf, settings));
  return buildCourseProgressReport(results);
}

export async function fetchTeachingDeliveryReport(
  prisma: PrismaClient,
  filter: ReportFilter,
  settings: Settings,
  asOf: ISODate,
): Promise<{ items: TeachingDeliveryReportItem[]; summary: TeachingDeliverySummary }> {
  const where: Prisma.SubjectWhereInput = {
    id: filter.subjectId,
    facultyId: filter.facultyId,
    batchId: filter.batchId,
    batch: {
      semesterId: filter.semesterId,
      semester: {
        campusId: filter.campusId,
        track: filter.track,
      },
    },
  };

  const contexts = await loadSubjectContexts(prisma, where);
  const subjectsInput: TeachingDeliveryInputSubject[] = [];

  for (const ctx of contexts) {
    const s = ctx.subject;
    const sem = s.batch.semester;
    const semStart = iso(sem.startsOn);
    const semEnd = iso(sem.endsOn);
    const from = filter.from && filter.from > semStart ? filter.from : semStart;
    const to = filter.to && filter.to < semEnd ? filter.to : semEnd;

    const tctx = teachingContextFor(ctx);
    const slots = s.timetable.map((t) => ({
      id: t.id,
      weekday: t.weekday,
      startTime: t.startTime,
      endTime: t.endTime,
    }));

    // Scheduled timetable occurrences within the evaluated range
    const occurrences = occurrencesBetween(slots, from, to, tctx);
    const scheduledHours = occurrences.reduce((sum, o) => sum + o.hours, 0);

    // Filter sessions to the evaluated date range
    const sessions = s.sessions
      .filter((sess) => {
        const held = iso(sess.heldOn);
        return held >= from && held <= to;
      })
      .map((sess) => ({
        id: sess.id,
        heldOn: iso(sess.heldOn),
        outcome: sess.outcome,
        actualHours: sess.actualHours,
        scheduledHours: sess.scheduledHours,
      }));

    // Unlogged past sessions: occurrences before asOf with no matching log
    const pastOccurrences = occurrences.filter((o) => o.date < asOf);
    const unloggedPastSessions = pastOccurrences.filter(
      (o) => !s.sessions.some((l) => l.timetableEntryId === o.entryId && iso(l.heldOn) === o.date),
    ).length;

    subjectsInput.push({
      subjectId: s.id,
      code: s.code,
      name: s.name,
      batchId: s.batchId,
      batchName: s.batch.name,
      semesterId: sem.id,
      semesterName: sem.name,
      campusId: sem.campusId,
      track: sem.track,
      facultyId: s.facultyId,
      facultyName: s.faculty?.name ?? null,
      isSample: s.isSample,
      scheduledSessionsCount: occurrences.length,
      scheduledHours,
      sessions,
      unloggedPastSessions,
    });
  }

  return buildTeachingDeliveryReport(subjectsInput);
}

export async function fetchFacultyActivityReport(
  prisma: PrismaClient,
  filter: ReportFilter,
  settings: Settings,
  asOf: ISODate,
): Promise<{ items: FacultyActivityReportItem[]; summary: FacultyActivitySummary }> {
  const facultyWhere: Prisma.FacultyWhereInput = {
    id: filter.facultyId,
    campusId: filter.campusId,
  };

  const facultyRows = await prisma.faculty.findMany({
    where: facultyWhere,
    include: {
      subjects: {
        include: {
          batch: { include: { semester: true } },
          timetable: true,
          sessions: true,
        },
      },
      sessionLogs: {
        where: {
          heldOn: {
            gte: filter.from ? dbDate(filter.from) : undefined,
            lte: filter.to ? dbDate(filter.to) : undefined,
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const facultyList: FacultyActivityInput[] = [];

  for (const f of facultyRows) {
    // Subject filter if specified
    const subjects = filter.subjectId
      ? f.subjects.filter((s) => s.id === filter.subjectId)
      : f.subjects;

    // Track or batch filters if specified
    const filteredSubjects = subjects.filter((s) => {
      if (filter.track && s.batch.semester.track !== filter.track) return false;
      if (filter.batchId && s.batchId !== filter.batchId) return false;
      if (filter.semesterId && s.batch.semesterId !== filter.semesterId) return false;
      return true;
    });

    // Sessions logged by this faculty member OR logged for subjects assigned to this faculty
    const logsMap = new Map<string, (typeof f.sessionLogs)[number]>();
    for (const l of f.sessionLogs) logsMap.set(l.id, l);
    for (const s of filteredSubjects) {
      for (const l of s.sessions) {
        const held = iso(l.heldOn);
        if (filter.from && held < filter.from) continue;
        if (filter.to && held > filter.to) continue;
        logsMap.set(l.id, l);
      }
    }

    const logs = [...logsMap.values()].map((l) => ({
      id: l.id,
      heldOn: iso(l.heldOn),
      outcome: l.outcome,
      actualHours: l.actualHours,
      scheduledHours: l.scheduledHours,
      reviewedAt: l.reviewedAt,
      createdAt: l.createdAt,
    }));

    // Calculate unlogged past sessions across assigned subjects
    let unloggedPast = 0;
    for (const s of filteredSubjects) {
      const sem = s.batch.semester;
      const tctx = {
        rule: sem.saturdayRule,
        calendar: [],
        examPeriods: [],
      };
      const slots = s.timetable.map((t) => ({
        id: t.id,
        weekday: t.weekday,
        startTime: t.startTime,
        endTime: t.endTime,
      }));
      const from = iso(sem.startsOn);
      const to = asOf < iso(sem.endsOn) ? asOf : iso(sem.endsOn);
      if (from < to) {
        const occurrences = occurrencesBetween(slots, from, to, tctx);
        unloggedPast += occurrences.filter(
          (o) => !s.sessions.some((l) => l.timetableEntryId === o.entryId && iso(l.heldOn) === o.date),
        ).length;
      }
    }

    facultyList.push({
      facultyId: f.id,
      facultyName: f.name,
      email: f.email,
      campusId: f.campusId,
      isSample: f.isSample,
      assignedSubjectsCount: filteredSubjects.length,
      logs,
      unloggedPastSessions: unloggedPast,
    });
  }

  return buildFacultyActivityReport(facultyList);
}

export async function fetchExamReadinessReport(
  prisma: PrismaClient,
  filter: ReportFilter,
  settings: Settings,
  asOf: ISODate,
): Promise<{ items: ExamReadinessReportItem[]; summary: ExamReadinessReportSummary }> {
  const targetCampuses = filter.campusId
    ? campuses.filter((c) => c.id === filter.campusId)
    : campuses;

  const facultySubjectIds = filter.facultyId
    ? new Set(
        (
          await prisma.subject.findMany({
            where: { facultyId: filter.facultyId },
            select: { id: true },
          })
        ).map((s) => s.id),
      )
    : null;

  const batchSubjectIds = filter.batchId
    ? new Set(
        (
          await prisma.subject.findMany({
            where: { batchId: filter.batchId },
            select: { id: true },
          })
        ).map((s) => s.id),
      )
    : null;

  const items: ExamReadinessReportItem[] = [];
  let atRiskCount = 0;
  let onTrackCount = 0;
  let completeCount = 0;
  let needsDataCount = 0;
  let totalExamsCount = 0;

  for (const c of targetCampuses) {
    const readiness = await buildExamReadiness(
      prisma,
      { campusId: c.id, track: filter.track, semesterId: filter.semesterId, asOf },
      settings,
    );
    totalExamsCount += readiness.exams.length;

    for (const exam of readiness.exams) {
      for (const s of exam.subjects) {
        if (filter.subjectId && s.subjectId !== filter.subjectId) continue;
        if (batchSubjectIds && !batchSubjectIds.has(s.subjectId)) continue;
        if (facultySubjectIds && !facultySubjectIds.has(s.subjectId)) continue;

        items.push({
          examId: exam.id,
          examName: exam.name,
          examType: exam.type,
          examTypeLabel: exam.typeLabel,
          startsOn: exam.startsOn,
          endsOn: exam.endsOn,
          daysToStart: exam.daysToStart,
          phase: exam.phase,
          lastTeachingDate: exam.lastTeachingDate,
          subjectId: s.subjectId,
          code: s.code,
          name: s.name,
          batchName: s.batchName,
          facultyName: s.facultyName,
          status: s.status,
          coveragePct: s.coveragePct,
          hoursInScope: s.hoursInScope,
          coveredHours: s.coveredHours,
          remainingHours: s.remainingHours,
          availableHours: s.availableHours,
          bufferRatio: s.bufferRatio,
          scopeMode: s.scopeMode,
          unscopedTopics: s.unscopedTopics,
          headline: s.headline,
          isSample: s.isSample,
        });

        if (s.status === "DANGER" || s.status === "TIGHT") atRiskCount++;
        else if (s.status === "ON_TRACK") onTrackCount++;
        else if (s.status === "COMPLETE") completeCount++;
        else if (s.status === "UNKNOWN") needsDataCount++;
      }
    }
  }

  return {
    items,
    summary: {
      totalExams: totalExamsCount,
      totalAssessedSubjects: items.length,
      atRiskCount,
      onTrackCount,
      completeCount,
      needsDataCount,
    },
  };
}

export async function fetchCampusTrackReport(
  prisma: PrismaClient,
  filter: ReportFilter,
  settings: Settings,
  asOf: ISODate,
): Promise<{ items: CampusTrackSummaryReportItem[]; summary: CampusTrackSummarySummary }> {
  const targetCampuses = filter.campusId
    ? campuses.filter((c) => c.id === filter.campusId)
    : campuses;

  const targetTracks = filter.track ? [filter.track] : (["MIRAI", "UNIVERSITY"] as const);
  const groups: CampusTrackSummaryReportItem[] = [];

  for (const c of targetCampuses) {
    for (const trk of targetTracks) {
      // Find active or applicable semester
      const semester = await prisma.semester.findFirst({
        where: {
          campusId: c.id,
          track: trk,
          isActive: true,
          startsOn: { lte: dbDate(asOf) },
          endsOn: { gte: dbDate(asOf) },
        },
      });

      const contexts = await loadSubjectContexts(prisma, {
        id: filter.subjectId,
        facultyId: filter.facultyId,
        batchId: filter.batchId,
        batch: {
          semester: {
            campusId: c.id,
            track: trk,
            ...(semester ? { id: semester.id } : {}),
          },
        },
      });

      if (contexts.length === 0) continue;

      const results = contexts.map((ctx) => computeSubjectResult(ctx, asOf, settings));
      const prog = buildCourseProgressReport(results);

      let hoursTaught = 0;
      let totalLogs = 0;
      let totalScheduled = 0;

      for (const ctx of contexts) {
        hoursTaught += ctx.subject.sessions.reduce((acc, sess) => {
          if (sess.outcome === "COMPLETED" || sess.outcome === "IN_PROGRESS") {
            return acc + (sess.actualHours ?? sess.scheduledHours ?? 0);
          }
          return acc;
        }, 0);
        totalLogs += ctx.subject.sessions.length;

        const sem = ctx.subject.batch.semester;
        const slots = ctx.subject.timetable.map((t) => ({
          id: t.id,
          weekday: t.weekday,
          startTime: t.startTime,
          endTime: t.endTime,
        }));
        const occurrences = occurrencesBetween(slots, iso(sem.startsOn), asOf < iso(sem.endsOn) ? asOf : iso(sem.endsOn), teachingContextFor(ctx));
        totalScheduled += occurrences.length;
      }

      groups.push({
        campusId: c.id,
        campusName: c.name,
        track: trk,
        activeSemesterName: semester?.name ?? null,
        totalSubjects: results.length,
        overallStatus: prog.summary.overallStatus,
        riskCounts: prog.summary.riskCounts,
        hoursInScope: prog.summary.totalHoursInScope,
        coveredHours: prog.summary.totalCoveredHours,
        remainingHours: prog.summary.totalRemainingHours,
        coveragePct: prog.summary.aggregateCoveragePct,
        hoursTaught: Number(hoursTaught.toFixed(2)),
        totalScheduled,
        totalLogs,
      });
    }
  }

  return buildCampusTrackReport(groups);
}
