import { describe, expect, it } from "vitest";
import {
  buildCampusTrackReport,
  buildCourseProgressReport,
  buildFacultyActivityReport,
  buildTeachingDeliveryReport,
  campusTrackToCsv,
  courseProgressToCsv,
  examReadinessToCsv,
  facultyActivityToCsv,
  teachingDeliveryToCsv,
} from "./reports.js";
import type { SubjectResult } from "../services/progressionData.js";

const makeSubjectResult = (overrides: Partial<SubjectResult> = {}): SubjectResult => ({
  subject: {
    id: "subj-1",
    code: "=CS101", // test formula injection prevention
    name: "Intro to CS",
    batchId: "batch-1",
    batchName: "Batch A",
    semesterId: "sem-1",
    semesterName: "Sem 1",
    campusId: "hi-tech",
    track: "MIRAI",
    facultyId: "fac-1",
    facultyName: "Dr. Raman",
    isSample: true,
  },
  deadline: { date: "2026-11-15", lastTeachingDate: "2026-11-14", source: "exam", examType: "END_TERM", label: "End-Term" },
  referenceDate: "2026-10-15",
  progress: {
    risk: "ON_TRACK",
    headline: "Coverage on track with healthy buffer",
    reasons: ["Buffer 1.25 covers remaining syllabus"],
    hoursInScope: 40,
    coveredHours: 20,
    remainingHours: 20,
    coveragePct: 50,
    plannedToDateHours: 20,
    paceHours: 0,
    availableHours: 25,
    bufferRatio: 1.25,
    projectedCompletion: "2026-11-10",
    projectionNote: "Finishes before deadline",
    overdueTopics: [],
    unloggedPastSessions: 0,
    remainingSessions: 10,
    topics: [],
    thresholds: { onTrack: 1.15, tight: 1.0 },
  },
  hoursTaught: 20,
  sessionsLogged: 10,
  lastLoggedOn: "2026-10-14",
  teachingCapacityHours: 45,
  weeklyHours: 4,
  ...overrides,
});

describe("Course Progress Report domain logic", () => {
  it("aggregates subject results with worst-status rule and correct totals", () => {
    const s1 = makeSubjectResult({
      subject: { ...makeSubjectResult().subject, id: "s1", code: "CS101", name: "CS 1" },
      progress: { ...makeSubjectResult().progress, risk: "ON_TRACK", hoursInScope: 40, coveredHours: 30, remainingHours: 10, availableHours: 15, bufferRatio: 1.5, coveragePct: 75 },
    });
    const s2 = makeSubjectResult({
      subject: { ...makeSubjectResult().subject, id: "s2", code: "CS102", name: "CS 2" },
      progress: { ...makeSubjectResult().progress, risk: "DANGER", hoursInScope: 40, coveredHours: 10, remainingHours: 30, availableHours: 15, bufferRatio: 0.5, coveragePct: 25 },
    });

    const report = buildCourseProgressReport([s1, s2]);

    expect(report.items).toHaveLength(2);
    expect(report.summary.totalSubjects).toBe(2);
    // Worst status rule: DANGER trumps ON_TRACK
    expect(report.summary.overallStatus).toBe("DANGER");
    expect(report.summary.riskCounts.DANGER).toBe(1);
    expect(report.summary.riskCounts.ON_TRACK).toBe(1);
    expect(report.summary.totalHoursInScope).toBe(80);
    expect(report.summary.totalCoveredHours).toBe(40);
    expect(report.summary.totalRemainingHours).toBe(40);
    expect(report.summary.totalAvailableHours).toBe(30);
    // Aggregate coverage: 40 / 80 = 50.0%
    expect(report.summary.aggregateCoveragePct).toBe(50.0);
  });

  it("handles empty results and subjects with no syllabus hours gracefully", () => {
    const emptyReport = buildCourseProgressReport([]);
    expect(emptyReport.items).toEqual([]);
    expect(emptyReport.summary.totalSubjects).toBe(0);
    expect(emptyReport.summary.overallStatus).toBeNull();
    expect(emptyReport.summary.aggregateCoveragePct).toBeNull();

    const noHours = makeSubjectResult({
      progress: { ...makeSubjectResult().progress, risk: "UNKNOWN", hoursInScope: 0, coveredHours: 0, remainingHours: 0, availableHours: 10, bufferRatio: null, coveragePct: null },
    });
    const singleReport = buildCourseProgressReport([noHours]);
    expect(singleReport.summary.overallStatus).toBe("UNKNOWN");
    expect(singleReport.summary.aggregateCoveragePct).toBeNull();
  });

  it("exports CSV protecting formula injection and outputting valid RFC 4180 format", () => {
    const s = makeSubjectResult(); // code starts with '='
    const report = buildCourseProgressReport([s]);
    const csv = courseProgressToCsv(report);

    // Formula injection check: '=CS101' should be escaped with leading single quote
    expect(csv).toContain("'=CS101");
    expect(csv).toContain("Subject Code,Subject Name");
    expect(csv).toContain("TOTAL / OVERALL");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("Teaching Delivery Report domain logic", () => {
  it("enforces established counting rules for completed, cancelled, skipped and merged sessions", () => {
    const subjects = [
      {
        subjectId: "subj-1",
        code: "MATH101",
        name: "Discrete Math",
        batchId: "b1",
        batchName: "Batch 1",
        semesterId: "sem-1",
        semesterName: "Semester 1",
        campusId: "hi-tech",
        track: "MIRAI" as const,
        facultyId: "fac-1",
        facultyName: "Prof. Euler",
        isSample: false,
        scheduledSessionsCount: 5,
        scheduledHours: 7.5,
        sessions: [
          { id: "log-1", heldOn: "2026-10-01", outcome: "COMPLETED" as const, actualHours: 1.5, scheduledHours: 1.5 },
          { id: "log-2", heldOn: "2026-10-03", outcome: "IN_PROGRESS" as const, actualHours: 1.0, scheduledHours: 1.5 },
          { id: "log-3", heldOn: "2026-10-05", outcome: "CANCELLED" as const, actualHours: null, scheduledHours: 1.5 },
          { id: "log-4", heldOn: "2026-10-07", outcome: "SKIPPED" as const, actualHours: null, scheduledHours: 1.5 },
          { id: "log-5", heldOn: "2026-10-09", outcome: "MERGED" as const, actualHours: null, scheduledHours: 1.5 },
        ],
        unloggedPastSessions: 0,
      },
    ];

    const report = buildTeachingDeliveryReport(subjects);
    expect(report.items).toHaveLength(1);
    const item = report.items[0]!;

    expect(item.completed).toBe(1);
    expect(item.inProgress).toBe(1);
    expect(item.cancelled).toBe(1);
    expect(item.skipped).toBe(1);
    expect(item.merged).toBe(1);

    // Actual hours taught: completed (1.5) + in_progress (1.0). Cancelled, skipped, merged count as 0 hours!
    expect(item.actualHours).toBe(2.5);

    // Delivery rate: held count = completed (1) + inProgress (1) + merged (1) = 3 out of 5 scheduled = 60.0%
    expect(item.deliveryRatePct).toBe(60.0);

    expect(report.summary.totalScheduled).toBe(5);
    expect(report.summary.totalCompleted).toBe(1);
    expect(report.summary.totalActualHours).toBe(2.5);
    expect(report.summary.overallDeliveryRatePct).toBe(60.0);
  });

  it("exports teaching delivery CSV with summary totals", () => {
    const report = buildTeachingDeliveryReport([]);
    const csv = teachingDeliveryToCsv(report);
    expect(csv).toContain("Total Scheduled");
    expect(csv).toContain("Delivery Rate %");
    expect(csv).toContain("TOTAL");
  });
});

describe("Faculty Activity Report domain logic", () => {
  it("computes logging compliance, reviewed vs pending, and actual hours taught", () => {
    const faculty = [
      {
        facultyId: "fac-1",
        facultyName: "Dr. Ada Lovelace",
        email: "+ada@mirai.edu", // test formula injection on email
        campusId: "hi-tech",
        isSample: false,
        assignedSubjectsCount: 2,
        logs: [
          { id: "l1", heldOn: "2026-10-10", outcome: "COMPLETED" as const, actualHours: 2.0, scheduledHours: 2.0, reviewedAt: new Date("2026-10-11"), createdAt: new Date("2026-10-10") },
          { id: "l2", heldOn: "2026-10-12", outcome: "COMPLETED" as const, actualHours: 2.0, scheduledHours: 2.0, reviewedAt: null, createdAt: new Date("2026-10-12") },
          { id: "l3", heldOn: "2026-10-14", outcome: "MERGED" as const, actualHours: null, scheduledHours: 2.0, reviewedAt: null, createdAt: new Date("2026-10-14") },
        ],
        unloggedPastSessions: 1,
      },
    ];

    const report = buildFacultyActivityReport(faculty);
    expect(report.items).toHaveLength(1);
    const item = report.items[0]!;

    expect(item.totalLogs).toBe(3);
    expect(item.completedLogs).toBe(2);
    expect(item.mergedLogs).toBe(1);
    // Merged carries 0 hours, completed carries 4.0 hours
    expect(item.hoursTaught).toBe(4.0);
    expect(item.reviewedLogs).toBe(1);
    expect(item.pendingReviewLogs).toBe(2);
    expect(item.lastLoggedOn).toBe("2026-10-14");
    expect(item.unloggedPast).toBe(1);

    const csv = facultyActivityToCsv(report);
    // Email starting with + should be escaped
    expect(csv).toContain("'+ada@mirai.edu");
    expect(csv).toContain("Dr. Ada Lovelace");
  });
});

describe("Campus & Track Summary domain logic", () => {
  it("summarizes cross-campus and cross-track comparisons with worst-status rollup", () => {
    const groups = [
      {
        campusId: "hi-tech",
        campusName: "HI-Tech",
        track: "MIRAI" as const,
        activeSemesterName: "Fall 2026",
        totalSubjects: 4,
        overallStatus: "TIGHT" as const,
        riskCounts: { DANGER: 0, TIGHT: 1, ON_TRACK: 2, COMPLETE: 1, UNKNOWN: 0 },
        hoursInScope: 160,
        coveredHours: 80,
        remainingHours: 80,
        coveragePct: 50.0,
        hoursTaught: 70,
        totalScheduled: 40,
        totalLogs: 38,
      },
      {
        campusId: "ratnam",
        campusName: "Ratnam",
        track: "UNIVERSITY" as const,
        activeSemesterName: "Fall 2026",
        totalSubjects: 3,
        overallStatus: "DANGER" as const,
        riskCounts: { DANGER: 1, TIGHT: 0, ON_TRACK: 2, COMPLETE: 0, UNKNOWN: 0 },
        hoursInScope: 120,
        coveredHours: 40,
        remainingHours: 80,
        coveragePct: 33.3,
        hoursTaught: 35,
        totalScheduled: 30,
        totalLogs: 20,
      },
    ];

    const report = buildCampusTrackReport(groups);
    expect(report.items).toHaveLength(2);
    expect(report.summary.totalCampuses).toBe(2);
    expect(report.summary.totalSubjects).toBe(7);
    // Institutional worst status: DANGER wins over TIGHT
    expect(report.summary.institutionalStatus).toBe("DANGER");
    expect(report.summary.totalHoursInScope).toBe(280);
    expect(report.summary.totalCoveredHours).toBe(120);
    // Aggregate coverage %: 120 / 280 = 42.9%
    expect(report.summary.aggregateCoveragePct).toBe(42.9);

    const csv = campusTrackToCsv(report);
    expect(csv).toContain("Campus,Track");
    expect(csv).toContain("HI-Tech,MIRAI");
    expect(csv).toContain("Ratnam,UNIVERSITY");
    expect(csv).toContain("TOTAL / INSTITUTIONAL");
  });
});

describe("Exam Readiness CSV export", () => {
  it("formats exam readiness report into clean CSV with totals", () => {
    const report = {
      items: [
        {
          examId: "exam-1",
          examName: "Mid-Term",
          examType: "MID_TERM" as const,
          examTypeLabel: "Mid-term",
          startsOn: "2026-10-26",
          endsOn: "2026-10-30",
          daysToStart: 7,
          phase: "upcoming" as const,
          lastTeachingDate: "2026-10-25",
          subjectId: "s1",
          code: "CS101",
          name: "Algorithms",
          batchName: "Mirai A",
          facultyName: "Dr. Turing",
          status: "ON_TRACK" as const,
          coveragePct: 60,
          hoursInScope: 20,
          coveredHours: 12,
          remainingHours: 8,
          availableHours: 12,
          bufferRatio: 1.5,
          scopeMode: "exam_scope" as const,
          unscopedTopics: 0,
          headline: "Sufficient buffer before exam",
          isSample: false,
        },
      ],
      summary: {
        totalExams: 1,
        totalAssessedSubjects: 1,
        atRiskCount: 0,
        onTrackCount: 1,
        completeCount: 0,
        needsDataCount: 0,
      },
    };

    const csv = examReadinessToCsv(report);
    expect(csv).toContain("Exam Name,Exam Type");
    expect(csv).toContain("Mid-Term,Mid-term");
    expect(csv).toContain("TOTAL ASSESSED");
  });
});
