/**
 * Pure domain functions for Academic Intelligence & Reports (Phase 11).
 * Nothing calculated here is stored. Everything is derived from authoritative
 * subject progression results, timetable occurrences, and session logs.
 */
import { worstStatus, type RiskStatus } from "./progress.js";
import type { ISODate } from "./dates.js";
import type { SubjectResult } from "../services/progressionData.js";
import { toCsv } from "./csv.js";

export type ReportType = "course_progress" | "teaching_delivery" | "faculty_activity" | "exam_readiness" | "campus_track";

/* =========================================================================
   1. Course Progress Report
   ========================================================================= */

export interface CourseProgressReportItem {
  subjectId: string;
  code: string;
  name: string;
  batchId: string;
  batchName: string;
  semesterId: string;
  semesterName: string;
  campusId: string;
  track: "MIRAI" | "UNIVERSITY";
  facultyId: string | null;
  facultyName: string | null;
  status: RiskStatus;
  coveragePct: number | null;
  hoursInScope: number;
  coveredHours: number;
  remainingHours: number;
  availableHours: number | null;
  bufferRatio: number | null;
  paceHours: number;
  overdueCount: number;
  projectedCompletion: ISODate | null;
  deadline: ISODate;
  deadlineLabel: string;
  headline: string;
  isSample: boolean;
}

export interface CourseProgressSummary {
  totalSubjects: number;
  overallStatus: RiskStatus | null;
  riskCounts: Record<RiskStatus, number>;
  totalHoursInScope: number;
  totalCoveredHours: number;
  totalRemainingHours: number;
  totalAvailableHours: number;
  aggregateCoveragePct: number | null;
}

export function buildCourseProgressReport(results: SubjectResult[]): {
  items: CourseProgressReportItem[];
  summary: CourseProgressSummary;
} {
  const items: CourseProgressReportItem[] = results.map((r) => {
    const p = r.progress;
    return {
      subjectId: r.subject.id,
      code: r.subject.code,
      name: r.subject.name,
      batchId: r.subject.batchId,
      batchName: r.subject.batchName,
      semesterId: r.subject.semesterId,
      semesterName: r.subject.semesterName,
      campusId: r.subject.campusId,
      track: r.subject.track,
      facultyId: r.subject.facultyId,
      facultyName: r.subject.facultyName,
      status: p.risk,
      coveragePct: p.coveragePct,
      hoursInScope: Number(p.hoursInScope.toFixed(2)),
      coveredHours: Number(p.coveredHours.toFixed(2)),
      remainingHours: Number(p.remainingHours.toFixed(2)),
      availableHours: p.availableHours !== null ? Number(p.availableHours.toFixed(2)) : null,
      bufferRatio: p.bufferRatio,
      paceHours: Number(p.paceHours.toFixed(2)),
      overdueCount: p.overdueTopics.length,
      projectedCompletion: p.projectedCompletion,
      deadline: r.deadline.date,
      deadlineLabel: r.deadline.label,
      headline: p.headline,
      isSample: r.subject.isSample,
    };
  });

  const riskCounts: Record<RiskStatus, number> = {
    DANGER: 0,
    TIGHT: 0,
    ON_TRACK: 0,
    COMPLETE: 0,
    UNKNOWN: 0,
  };

  let totalHoursInScope = 0;
  let totalCoveredHours = 0;
  let totalRemainingHours = 0;
  let totalAvailableHours = 0;

  for (const item of items) {
    riskCounts[item.status] = (riskCounts[item.status] ?? 0) + 1;
    totalHoursInScope += item.hoursInScope;
    totalCoveredHours += item.coveredHours;
    totalRemainingHours += item.remainingHours;
    if (item.availableHours !== null) totalAvailableHours += item.availableHours;
  }

  totalHoursInScope = Number(totalHoursInScope.toFixed(2));
  totalCoveredHours = Number(totalCoveredHours.toFixed(2));
  totalRemainingHours = Number(totalRemainingHours.toFixed(2));
  totalAvailableHours = Number(totalAvailableHours.toFixed(2));

  const aggregateCoveragePct =
    totalHoursInScope > 0
      ? Number(((totalCoveredHours / totalHoursInScope) * 100).toFixed(1))
      : null;

  return {
    items,
    summary: {
      totalSubjects: items.length,
      overallStatus: worstStatus(items.map((i) => i.status)),
      riskCounts,
      totalHoursInScope,
      totalCoveredHours,
      totalRemainingHours,
      totalAvailableHours,
      aggregateCoveragePct,
    },
  };
}

export function courseProgressToCsv(report: { items: CourseProgressReportItem[]; summary: CourseProgressSummary }): string {
  const headers = [
    "Subject Code",
    "Subject Name",
    "Batch",
    "Track",
    "Campus",
    "Faculty",
    "Status",
    "Coverage %",
    "Hours in Scope",
    "Covered Hours",
    "Remaining Hours",
    "Available Hours",
    "Buffer Ratio",
    "Pace Hours",
    "Overdue Topics",
    "Projected Completion",
    "Deadline",
    "Headline",
  ];

  const rows: Array<Array<string | number | null | undefined>> = report.items.map((i) => [
    i.code,
    i.name,
    i.batchName,
    i.track,
    i.campusId,
    i.facultyName ?? "No faculty",
    i.status,
    i.coveragePct !== null ? `${i.coveragePct}%` : "—",
    i.hoursInScope,
    i.coveredHours,
    i.remainingHours,
    i.availableHours !== null ? i.availableHours : "—",
    i.bufferRatio !== null ? i.bufferRatio.toFixed(2) : "—",
    i.paceHours,
    i.overdueCount,
    i.projectedCompletion ?? "—",
    `${i.deadline} (${i.deadlineLabel})`,
    i.headline,
  ]);

  // Add overall summary row
  rows.push([
    "TOTAL / OVERALL",
    `${report.summary.totalSubjects} subjects`,
    "",
    "",
    "",
    "",
    report.summary.overallStatus ?? "NO DATA",
    report.summary.aggregateCoveragePct !== null ? `${report.summary.aggregateCoveragePct}%` : "—",
    report.summary.totalHoursInScope,
    report.summary.totalCoveredHours,
    report.summary.totalRemainingHours,
    report.summary.totalAvailableHours,
    "",
    "",
    "",
    "",
    "",
    "",
  ]);

  return toCsv(headers, rows);
}

/* =========================================================================
   2. Teaching Delivery Report
   ========================================================================= */

export interface TeachingDeliveryInputSubject {
  subjectId: string;
  code: string;
  name: string;
  batchId: string;
  batchName: string;
  semesterId: string;
  semesterName: string;
  campusId: string;
  track: "MIRAI" | "UNIVERSITY";
  facultyId: string | null;
  facultyName: string | null;
  isSample: boolean;
  scheduledSessionsCount: number;
  scheduledHours: number;
  sessions: Array<{
    id: string;
    heldOn: ISODate;
    outcome: "COMPLETED" | "IN_PROGRESS" | "CANCELLED" | "SKIPPED" | "MERGED";
    actualHours: number | null;
    scheduledHours: number | null;
  }>;
  unloggedPastSessions: number;
}

export interface TeachingDeliveryReportItem {
  subjectId: string;
  code: string;
  name: string;
  batchId: string;
  batchName: string;
  semesterId: string;
  semesterName: string;
  campusId: string;
  track: "MIRAI" | "UNIVERSITY";
  facultyId: string | null;
  facultyName: string | null;
  totalScheduled: number;
  completed: number;
  inProgress: number;
  cancelled: number;
  skipped: number;
  merged: number;
  scheduledHours: number;
  actualHours: number;
  unloggedPast: number;
  deliveryRatePct: number | null;
  isSample: boolean;
}

export interface TeachingDeliverySummary {
  totalScheduled: number;
  totalCompleted: number;
  totalInProgress: number;
  totalCancelled: number;
  totalSkipped: number;
  totalMerged: number;
  totalScheduledHours: number;
  totalActualHours: number;
  totalUnloggedPast: number;
  overallDeliveryRatePct: number | null;
}

export function buildTeachingDeliveryReport(subjects: TeachingDeliveryInputSubject[]): {
  items: TeachingDeliveryReportItem[];
  summary: TeachingDeliverySummary;
} {
  const items: TeachingDeliveryReportItem[] = subjects.map((s) => {
    let completed = 0;
    let inProgress = 0;
    let cancelled = 0;
    let skipped = 0;
    let merged = 0;
    let actualHours = 0;

    for (const l of s.sessions) {
      switch (l.outcome) {
        case "COMPLETED":
          completed++;
          actualHours += l.actualHours ?? l.scheduledHours ?? 0;
          break;
        case "IN_PROGRESS":
          inProgress++;
          actualHours += l.actualHours ?? l.scheduledHours ?? 0;
          break;
        case "CANCELLED":
          cancelled++;
          // Cancelled sessions never count as teaching hours
          break;
        case "SKIPPED":
          skipped++;
          // Skipped sessions never count as teaching hours
          break;
        case "MERGED":
          merged++;
          // Merged sessions carry 0 teaching hours (counted on primary)
          break;
      }
    }

    actualHours = Number(actualHours.toFixed(2));
    const heldCount = completed + inProgress + merged;
    const deliveryRatePct =
      s.scheduledSessionsCount > 0
        ? Number(((heldCount / s.scheduledSessionsCount) * 100).toFixed(1))
        : null;

    return {
      subjectId: s.subjectId,
      code: s.code,
      name: s.name,
      batchId: s.batchId,
      batchName: s.batchName,
      semesterId: s.semesterId,
      semesterName: s.semesterName,
      campusId: s.campusId,
      track: s.track,
      facultyId: s.facultyId,
      facultyName: s.facultyName,
      totalScheduled: s.scheduledSessionsCount,
      completed,
      inProgress,
      cancelled,
      skipped,
      merged,
      scheduledHours: Number(s.scheduledHours.toFixed(2)),
      actualHours,
      unloggedPast: s.unloggedPastSessions,
      deliveryRatePct,
      isSample: s.isSample,
    };
  });

  let totalScheduled = 0;
  let totalCompleted = 0;
  let totalInProgress = 0;
  let totalCancelled = 0;
  let totalSkipped = 0;
  let totalMerged = 0;
  let totalScheduledHours = 0;
  let totalActualHours = 0;
  let totalUnloggedPast = 0;

  for (const item of items) {
    totalScheduled += item.totalScheduled;
    totalCompleted += item.completed;
    totalInProgress += item.inProgress;
    totalCancelled += item.cancelled;
    totalSkipped += item.skipped;
    totalMerged += item.merged;
    totalScheduledHours += item.scheduledHours;
    totalActualHours += item.actualHours;
    totalUnloggedPast += item.unloggedPast;
  }

  totalScheduledHours = Number(totalScheduledHours.toFixed(2));
  totalActualHours = Number(totalActualHours.toFixed(2));

  const totalHeld = totalCompleted + totalInProgress + totalMerged;
  const overallDeliveryRatePct =
    totalScheduled > 0
      ? Number(((totalHeld / totalScheduled) * 100).toFixed(1))
      : null;

  return {
    items,
    summary: {
      totalScheduled,
      totalCompleted,
      totalInProgress,
      totalCancelled,
      totalSkipped,
      totalMerged,
      totalScheduledHours,
      totalActualHours,
      totalUnloggedPast,
      overallDeliveryRatePct,
    },
  };
}

export function teachingDeliveryToCsv(report: { items: TeachingDeliveryReportItem[]; summary: TeachingDeliverySummary }): string {
  const headers = [
    "Subject Code",
    "Subject Name",
    "Batch",
    "Track",
    "Campus",
    "Faculty",
    "Total Scheduled",
    "Completed",
    "In Progress",
    "Cancelled",
    "Skipped",
    "Merged",
    "Scheduled Hours",
    "Actual Hours Taught",
    "Unlogged Past",
    "Delivery Rate %",
  ];

  const rows: Array<Array<string | number | null | undefined>> = report.items.map((i) => [
    i.code,
    i.name,
    i.batchName,
    i.track,
    i.campusId,
    i.facultyName ?? "No faculty",
    i.totalScheduled,
    i.completed,
    i.inProgress,
    i.cancelled,
    i.skipped,
    i.merged,
    i.scheduledHours,
    i.actualHours,
    i.unloggedPast,
    i.deliveryRatePct !== null ? `${i.deliveryRatePct}%` : "—",
  ]);

  rows.push([
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    report.summary.totalScheduled,
    report.summary.totalCompleted,
    report.summary.totalInProgress,
    report.summary.totalCancelled,
    report.summary.totalSkipped,
    report.summary.totalMerged,
    report.summary.totalScheduledHours,
    report.summary.totalActualHours,
    report.summary.totalUnloggedPast,
    report.summary.overallDeliveryRatePct !== null ? `${report.summary.overallDeliveryRatePct}%` : "—",
  ]);

  return toCsv(headers, rows);
}

/* =========================================================================
   3. Faculty Activity Report
   ========================================================================= */

export interface FacultyActivityInput {
  facultyId: string;
  facultyName: string;
  email: string | null;
  campusId: string;
  isSample: boolean;
  assignedSubjectsCount: number;
  logs: Array<{
    id: string;
    heldOn: ISODate;
    outcome: "COMPLETED" | "IN_PROGRESS" | "CANCELLED" | "SKIPPED" | "MERGED";
    actualHours: number | null;
    scheduledHours: number | null;
    reviewedAt: Date | null;
    createdAt: Date;
  }>;
  unloggedPastSessions: number;
}

export interface FacultyActivityReportItem {
  facultyId: string;
  facultyName: string;
  email: string | null;
  campusId: string;
  assignedSubjectsCount: number;
  totalLogs: number;
  completedLogs: number;
  inProgressLogs: number;
  cancelledLogs: number;
  skippedLogs: number;
  mergedLogs: number;
  hoursTaught: number;
  reviewedLogs: number;
  pendingReviewLogs: number;
  lastLoggedOn: ISODate | null;
  unloggedPast: number;
  isSample: boolean;
}

export interface FacultyActivitySummary {
  totalFaculty: number;
  totalLogs: number;
  totalCompleted: number;
  totalHoursTaught: number;
  totalReviewed: number;
  totalPendingReview: number;
  totalUnloggedPast: number;
}

export function buildFacultyActivityReport(facultyList: FacultyActivityInput[]): {
  items: FacultyActivityReportItem[];
  summary: FacultyActivitySummary;
} {
  const items: FacultyActivityReportItem[] = facultyList.map((f) => {
    let completedLogs = 0;
    let inProgressLogs = 0;
    let cancelledLogs = 0;
    let skippedLogs = 0;
    let mergedLogs = 0;
    let hoursTaught = 0;
    let reviewedLogs = 0;
    let pendingReviewLogs = 0;
    let lastLoggedOn: ISODate | null = null;

    for (const l of f.logs) {
      if (!lastLoggedOn || l.heldOn > lastLoggedOn) lastLoggedOn = l.heldOn;
      if (l.reviewedAt) reviewedLogs++;
      else pendingReviewLogs++;

      switch (l.outcome) {
        case "COMPLETED":
          completedLogs++;
          hoursTaught += l.actualHours ?? l.scheduledHours ?? 0;
          break;
        case "IN_PROGRESS":
          inProgressLogs++;
          hoursTaught += l.actualHours ?? l.scheduledHours ?? 0;
          break;
        case "CANCELLED":
          cancelledLogs++;
          break;
        case "SKIPPED":
          skippedLogs++;
          break;
        case "MERGED":
          mergedLogs++;
          // 0 hours taught on merged session
          break;
      }
    }

    return {
      facultyId: f.facultyId,
      facultyName: f.facultyName,
      email: f.email,
      campusId: f.campusId,
      assignedSubjectsCount: f.assignedSubjectsCount,
      totalLogs: f.logs.length,
      completedLogs,
      inProgressLogs,
      cancelledLogs,
      skippedLogs,
      mergedLogs,
      hoursTaught: Number(hoursTaught.toFixed(2)),
      reviewedLogs,
      pendingReviewLogs,
      lastLoggedOn,
      unloggedPast: f.unloggedPastSessions,
      isSample: f.isSample,
    };
  });

  let totalLogs = 0;
  let totalCompleted = 0;
  let totalHoursTaught = 0;
  let totalReviewed = 0;
  let totalPendingReview = 0;
  let totalUnloggedPast = 0;

  for (const item of items) {
    totalLogs += item.totalLogs;
    totalCompleted += item.completedLogs;
    totalHoursTaught += item.hoursTaught;
    totalReviewed += item.reviewedLogs;
    totalPendingReview += item.pendingReviewLogs;
    totalUnloggedPast += item.unloggedPast;
  }

  return {
    items,
    summary: {
      totalFaculty: items.length,
      totalLogs,
      totalCompleted,
      totalHoursTaught: Number(totalHoursTaught.toFixed(2)),
      totalReviewed,
      totalPendingReview,
      totalUnloggedPast,
    },
  };
}

export function facultyActivityToCsv(report: { items: FacultyActivityReportItem[]; summary: FacultyActivitySummary }): string {
  const headers = [
    "Faculty Name",
    "Email",
    "Campus",
    "Assigned Subjects",
    "Total Logs",
    "Completed",
    "In Progress",
    "Cancelled",
    "Skipped",
    "Merged",
    "Hours Taught",
    "Reviewed Logs",
    "Pending Review",
    "Unlogged Past",
    "Last Logged On",
  ];

  const rows: Array<Array<string | number | null | undefined>> = report.items.map((i) => [
    i.facultyName,
    i.email ?? "—",
    i.campusId,
    i.assignedSubjectsCount,
    i.totalLogs,
    i.completedLogs,
    i.inProgressLogs,
    i.cancelledLogs,
    i.skippedLogs,
    i.mergedLogs,
    i.hoursTaught,
    i.reviewedLogs,
    i.pendingReviewLogs,
    i.unloggedPast,
    i.lastLoggedOn ?? "Never",
  ]);

  rows.push([
    "TOTAL",
    "",
    "",
    "",
    report.summary.totalLogs,
    report.summary.totalCompleted,
    "",
    "",
    "",
    "",
    report.summary.totalHoursTaught,
    report.summary.totalReviewed,
    report.summary.totalPendingReview,
    report.summary.totalUnloggedPast,
    "",
  ]);

  return toCsv(headers, rows);
}

/* =========================================================================
   4. Exam Readiness Report
   ========================================================================= */

export interface ExamReadinessReportItem {
  examId: string;
  examName: string;
  examType: "SESSIONAL" | "MID_TERM" | "PUT" | "END_TERM";
  examTypeLabel: string;
  startsOn: ISODate;
  endsOn: ISODate;
  daysToStart: number;
  phase: "upcoming" | "in_progress";
  lastTeachingDate: ISODate;
  subjectId: string;
  code: string;
  name: string;
  batchName: string;
  facultyName: string | null;
  status: RiskStatus;
  coveragePct: number | null;
  hoursInScope: number;
  coveredHours: number;
  remainingHours: number;
  availableHours: number | null;
  bufferRatio: number | null;
  scopeMode: "exam_scope" | "whole_syllabus";
  unscopedTopics: number;
  headline: string;
  isSample: boolean;
}

export interface ExamReadinessReportSummary {
  totalExams: number;
  totalAssessedSubjects: number;
  atRiskCount: number;
  onTrackCount: number;
  completeCount: number;
  needsDataCount: number;
}

export function examReadinessToCsv(report: { items: ExamReadinessReportItem[]; summary: ExamReadinessReportSummary }): string {
  const headers = [
    "Exam Name",
    "Exam Type",
    "Starts On",
    "Ends On",
    "Days to Start",
    "Last Teaching Date",
    "Subject Code",
    "Subject Name",
    "Batch",
    "Faculty",
    "Readiness Status",
    "Coverage %",
    "Syllabus Left (h)",
    "Teaching Left (h)",
    "Buffer Ratio",
    "Scope Mode",
    "Headline",
  ];

  const rows: Array<Array<string | number | null | undefined>> = report.items.map((i) => [
    i.examName,
    i.examTypeLabel,
    i.startsOn,
    i.endsOn,
    i.phase === "in_progress" ? "Under way" : i.daysToStart,
    i.lastTeachingDate,
    i.code,
    i.name,
    i.batchName,
    i.facultyName ?? "No faculty",
    i.status,
    i.coveragePct !== null ? `${i.coveragePct}%` : "—",
    i.remainingHours,
    i.availableHours !== null ? i.availableHours : "—",
    i.bufferRatio !== null ? i.bufferRatio.toFixed(2) : "—",
    i.scopeMode === "exam_scope" ? "Assessed topics" : "Whole syllabus",
    i.headline,
  ]);

  rows.push([
    "TOTAL ASSESSED",
    `${report.summary.totalExams} exam(s)`,
    "",
    "",
    "",
    "",
    `${report.summary.totalAssessedSubjects} subject(s)`,
    `At risk: ${report.summary.atRiskCount}`,
    `On track: ${report.summary.onTrackCount}`,
    `Needs data: ${report.summary.needsDataCount}`,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);

  return toCsv(headers, rows);
}

/* =========================================================================
   5. Campus & Track Summary Report
   ========================================================================= */

export interface CampusTrackSummaryReportItem {
  campusId: string;
  campusName: string;
  track: "MIRAI" | "UNIVERSITY";
  activeSemesterName: string | null;
  totalSubjects: number;
  overallStatus: RiskStatus | null;
  riskCounts: Record<RiskStatus, number>;
  hoursInScope: number;
  coveredHours: number;
  remainingHours: number;
  coveragePct: number | null;
  hoursTaught: number;
  totalScheduled: number;
  totalLogs: number;
}

export interface CampusTrackSummarySummary {
  totalCampuses: number;
  totalSubjects: number;
  institutionalStatus: RiskStatus | null;
  totalHoursInScope: number;
  totalCoveredHours: number;
  totalRemainingHours: number;
  aggregateCoveragePct: number | null;
  totalHoursTaught: number;
}

export function buildCampusTrackReport(groups: CampusTrackSummaryReportItem[]): {
  items: CampusTrackSummaryReportItem[];
  summary: CampusTrackSummarySummary;
} {
  const uniqueCampuses = new Set(groups.map((g) => g.campusId));
  let totalSubjects = 0;
  let totalHoursInScope = 0;
  let totalCoveredHours = 0;
  let totalRemainingHours = 0;
  let totalHoursTaught = 0;

  for (const g of groups) {
    totalSubjects += g.totalSubjects;
    totalHoursInScope += g.hoursInScope;
    totalCoveredHours += g.coveredHours;
    totalRemainingHours += g.remainingHours;
    totalHoursTaught += g.hoursTaught;
  }

  totalHoursInScope = Number(totalHoursInScope.toFixed(2));
  totalCoveredHours = Number(totalCoveredHours.toFixed(2));
  totalRemainingHours = Number(totalRemainingHours.toFixed(2));
  totalHoursTaught = Number(totalHoursTaught.toFixed(2));

  const aggregateCoveragePct =
    totalHoursInScope > 0
      ? Number(((totalCoveredHours / totalHoursInScope) * 100).toFixed(1))
      : null;

  return {
    items: groups,
    summary: {
      totalCampuses: uniqueCampuses.size,
      totalSubjects,
      institutionalStatus: worstStatus(groups.map((g) => g.overallStatus).filter((s): s is RiskStatus => s !== null)),
      totalHoursInScope,
      totalCoveredHours,
      totalRemainingHours,
      aggregateCoveragePct,
      totalHoursTaught,
    },
  };
}

export function campusTrackToCsv(report: { items: CampusTrackSummaryReportItem[]; summary: CampusTrackSummarySummary }): string {
  const headers = [
    "Campus",
    "Track",
    "Active Semester",
    "Overall Status",
    "Total Subjects",
    "Danger",
    "Tight",
    "On Track",
    "Complete",
    "Needs Data",
    "Hours in Scope",
    "Covered Hours",
    "Remaining Hours",
    "Coverage %",
    "Hours Taught",
    "Scheduled Sessions",
    "Logged Sessions",
  ];

  const rows: Array<Array<string | number | null | undefined>> = report.items.map((i) => [
    i.campusName,
    i.track,
    i.activeSemesterName ?? "None active",
    i.overallStatus ?? "NO DATA",
    i.totalSubjects,
    i.riskCounts.DANGER,
    i.riskCounts.TIGHT,
    i.riskCounts.ON_TRACK,
    i.riskCounts.COMPLETE,
    i.riskCounts.UNKNOWN,
    i.hoursInScope,
    i.coveredHours,
    i.remainingHours,
    i.coveragePct !== null ? `${i.coveragePct}%` : "—",
    i.hoursTaught,
    i.totalScheduled,
    i.totalLogs,
  ]);

  rows.push([
    "TOTAL / INSTITUTIONAL",
    `${report.summary.totalCampuses} campus(es)`,
    "",
    report.summary.institutionalStatus ?? "NO DATA",
    report.summary.totalSubjects,
    "",
    "",
    "",
    "",
    "",
    report.summary.totalHoursInScope,
    report.summary.totalCoveredHours,
    report.summary.totalRemainingHours,
    report.summary.aggregateCoveragePct !== null ? `${report.summary.aggregateCoveragePct}%` : "—",
    report.summary.totalHoursTaught,
    "",
    "",
  ]);

  return toCsv(headers, rows);
}
