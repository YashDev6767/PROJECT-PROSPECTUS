import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../context/AppContext";
import { ThemeProvider } from "../context/ThemeContext";
import { ToastProvider } from "../components/ui/Toast";
import { Reports } from "../pages/Reports";
import type { Dashboard, ReportsResponse } from "../lib/types";

const campus = { id: "c1", name: "Pune City Campus", city: "Pune" };

const dashboard: Dashboard = {
  dataSource: "demo",
  generatedAt: "2026-10-16T00:00:00Z",
  campuses: [campus],
  context: { campus, semester: "Sem 3", today: "2026-10-16" },
  metrics: { overallCoveragePct: 65, hoursBehind: 5, subjectsAtRisk: 1, nextExamInDays: 14 },
  schedule: [],
  atRisk: [],
  exams: [],
  recentSessions: [],
};

const courseProgressMock: ReportsResponse = {
  type: "course_progress",
  generatedAt: "2026-10-16T00:00:00Z",
  asOf: "2026-10-16",
  filter: {},
  courseProgress: {
    items: [
      {
        subjectId: "sub1",
        code: "CS101",
        name: "Data Structures",
        campusId: "c1",
        track: "MIRAI",
        batchId: "b1",
        batchName: "Batch A",
        semesterId: "sem1",
        semesterName: "Semester 3",
        facultyId: "f1",
        facultyName: "Dr. Sharma",
        status: "ON_TRACK",
        coveragePct: 77.8,
        hoursInScope: 45,
        coveredHours: 35,
        remainingHours: 10,
        availableHours: 25,
        bufferRatio: 1.5,
        paceHours: 3,
        overdueCount: 0,
        projectedCompletion: "2026-11-15",
        deadline: "2026-11-20",
        deadlineLabel: "End-Term",
        headline: "On track with 15h buffer",
        isSample: false,
      },
    ],
    summary: {
      totalSubjects: 1,
      overallStatus: "ON_TRACK",
      riskCounts: { DANGER: 0, TIGHT: 0, ON_TRACK: 1, COMPLETE: 0, UNKNOWN: 0 },
      aggregateCoveragePct: 77.8,
      totalRemainingHours: 10,
      totalAvailableHours: 25,
      totalHoursInScope: 45,
      totalCoveredHours: 35,
    },
  },
};

const teachingDeliveryMock: ReportsResponse = {
  type: "teaching_delivery",
  generatedAt: "2026-10-16T00:00:00Z",
  asOf: "2026-10-16",
  filter: {},
  teachingDelivery: {
    items: [
      {
        subjectId: "sub1",
        code: "CS101",
        name: "Data Structures",
        batchId: "b1",
        batchName: "Batch A",
        semesterId: "sem1",
        semesterName: "Semester 3",
        campusId: "c1",
        track: "MIRAI",
        facultyId: "f1",
        facultyName: "Dr. Sharma",
        totalScheduled: 20,
        completed: 18,
        inProgress: 0,
        cancelled: 1,
        skipped: 1,
        merged: 0,
        scheduledHours: 30,
        actualHours: 27,
        unloggedPast: 0,
        deliveryRatePct: 90,
        isSample: false,
      },
    ],
    summary: {
      totalScheduled: 20,
      totalCompleted: 18,
      totalInProgress: 0,
      totalCancelled: 1,
      totalSkipped: 1,
      totalMerged: 0,
      totalScheduledHours: 30,
      totalActualHours: 27,
      totalUnloggedPast: 0,
      overallDeliveryRatePct: 90,
    },
  },
};

const facultyActivityMock: ReportsResponse = {
  type: "faculty_activity",
  generatedAt: "2026-10-16T00:00:00Z",
  asOf: "2026-10-16",
  filter: {},
  facultyActivity: {
    items: [
      {
        facultyId: "f1",
        facultyName: "Dr. Sharma",
        email: "sharma@msot.edu",
        campusId: "c1",
        assignedSubjectsCount: 2,
        totalLogs: 18,
        completedLogs: 18,
        inProgressLogs: 0,
        cancelledLogs: 1,
        skippedLogs: 0,
        mergedLogs: 0,
        hoursTaught: 27,
        reviewedLogs: 18,
        pendingReviewLogs: 0,
        lastLoggedOn: "2026-10-15",
        unloggedPast: 0,
        isSample: false,
      },
    ],
    summary: {
      totalFaculty: 1,
      totalLogs: 18,
      totalCompleted: 18,
      totalHoursTaught: 27,
      totalReviewed: 18,
      totalPendingReview: 0,
      totalUnloggedPast: 0,
    },
  },
};

const examReadinessMock: ReportsResponse = {
  type: "exam_readiness",
  generatedAt: "2026-10-16T00:00:00Z",
  asOf: "2026-10-16",
  filter: {},
  examReadiness: {
    items: [
      {
        examId: "e1",
        examName: "End-Term Theory",
        examType: "END_TERM",
        examTypeLabel: "End-term",
        startsOn: "2026-11-20",
        endsOn: "2026-11-25",
        daysToStart: 35,
        phase: "upcoming",
        lastTeachingDate: "2026-11-18",
        subjectId: "sub1",
        code: "CS101",
        name: "Data Structures",
        batchName: "Batch A",
        facultyName: "Dr. Sharma",
        status: "ON_TRACK",
        coveragePct: 77.8,
        hoursInScope: 45,
        coveredHours: 35,
        remainingHours: 10,
        availableHours: 25,
        bufferRatio: 1.5,
        scopeMode: "exam_scope",
        unscopedTopics: 0,
        headline: "15.0h buffer before exam date",
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
  },
};

const campusTrackMock: ReportsResponse = {
  type: "campus_track",
  generatedAt: "2026-10-16T00:00:00Z",
  asOf: "2026-10-16",
  filter: {},
  campusTrack: {
    items: [
      {
        campusId: "c1",
        campusName: "Pune City Campus",
        track: "MIRAI",
        activeSemesterName: "Semester 3",
        overallStatus: "ON_TRACK",
        totalSubjects: 2,
        riskCounts: { DANGER: 0, TIGHT: 0, ON_TRACK: 2, COMPLETE: 0, UNKNOWN: 0 },
        hoursInScope: 90,
        coveredHours: 70,
        remainingHours: 20,
        coveragePct: 77.8,
        hoursTaught: 54,
        totalScheduled: 40,
        totalLogs: 36,
      },
    ],
    summary: {
      totalCampuses: 1,
      totalSubjects: 2,
      institutionalStatus: "ON_TRACK",
      aggregateCoveragePct: 77.8,
      totalHoursInScope: 90,
      totalCoveredHours: 70,
      totalRemainingHours: 20,
      totalHoursTaught: 54,
    },
  },
};

const renderReports = () =>
  render(
    <MemoryRouter initialEntries={["/reports"]}>
      <ThemeProvider>
        <ToastProvider>
          <AppProvider>
            <Reports />
          </AppProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );

describe("Reports page", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("prospectus.role", "admin");
    localStorage.setItem("prospectus.campus", "c1");

    fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/dashboard")) return new Response(JSON.stringify(dashboard));
      if (u.includes("/api/meta")) return new Response(JSON.stringify({ campuses: [campus] }));
      if (u.includes("/api/semesters"))
        return new Response(JSON.stringify({ semesters: [{ id: "sem1", name: "Semester 3", track: "MIRAI" }] }));
      if (u.includes("/api/batches"))
        return new Response(JSON.stringify({ batches: [{ id: "b1", name: "Batch A" }] }));
      if (u.includes("/api/faculty"))
        return new Response(JSON.stringify({ faculty: [{ id: "f1", name: "Dr. Sharma" }] }));
      if (u.includes("/api/subjects"))
        return new Response(JSON.stringify({ subjects: [{ id: "sub1", name: "Data Structures", code: "CS101" }] }));

      if (u.includes("type=teaching_delivery")) return new Response(JSON.stringify(teachingDeliveryMock));
      if (u.includes("type=faculty_activity")) return new Response(JSON.stringify(facultyActivityMock));
      if (u.includes("type=exam_readiness")) return new Response(JSON.stringify(examReadinessMock));
      if (u.includes("type=campus_track")) return new Response(JSON.stringify(campusTrackMock));

      // Default course_progress
      return new Response(JSON.stringify(courseProgressMock));
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders course progress report with stats and table data", async () => {
    renderReports();

    expect(await screen.findByRole("heading", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Course Progress" })).toHaveAttribute("aria-selected", "true");

    // Check stats
    expect(await screen.findByText("Total Subjects")).toBeInTheDocument();
    expect(screen.getByText("Data Structures")).toBeInTheDocument();
    expect(screen.getByText("CS101")).toBeInTheDocument();
  });

  it("switches to Teaching Delivery tab and loads delivery metrics", async () => {
    renderReports();
    await screen.findByText("Course Progress");

    await userEvent.click(screen.getByRole("tab", { name: "Teaching Delivery" }));
    expect(screen.getByRole("tab", { name: "Teaching Delivery" })).toHaveAttribute("aria-selected", "true");

    expect(await screen.findByText("Hours Delivered")).toBeInTheDocument();
    expect(screen.getAllByText("Delivery Rate").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Scheduled Sessions")).toBeInTheDocument();
  });

  it("switches to Faculty Activity tab and displays faculty log stats", async () => {
    renderReports();
    await screen.findByText("Course Progress");

    await userEvent.click(screen.getByRole("tab", { name: "Faculty Activity" }));

    expect(await screen.findByText("Active Faculty")).toBeInTheDocument();
    expect(await screen.findByText("Total Session Logs")).toBeInTheDocument();
    expect(screen.getAllByText("27 h").length).toBeGreaterThanOrEqual(1);
  });

  it("switches to Exam Readiness tab and displays buffer hours and status", async () => {
    renderReports();
    await screen.findByText("Course Progress");

    await userEvent.click(screen.getByRole("tab", { name: "Exam Readiness" }));

    expect(await screen.findByText("Assessed Subjects")).toBeInTheDocument();
    expect(await screen.findByText("End-Term Theory")).toBeInTheDocument();
    expect(screen.getByText("1.50")).toBeInTheDocument();
  });

  it("switches to Campus & Track tab and displays institutional status", async () => {
    renderReports();
    await screen.findByText("Course Progress");

    await userEvent.click(screen.getByRole("tab", { name: "Campus & Track" }));

    expect(await screen.findByText("Institutional Status")).toBeInTheDocument();
    expect(screen.getAllByText("Pune City Campus").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Mirai Track").length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state when no records match filter criteria", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/dashboard")) return new Response(JSON.stringify(dashboard));
      if (u.includes("/api/meta")) return new Response(JSON.stringify({ campuses: [campus] }));
      return new Response(
        JSON.stringify({
          type: "course_progress",
          generatedAt: "2026-10-16T00:00:00Z",
          asOf: "2026-10-16",
          filter: {},
          courseProgress: {
            items: [],
            summary: {
              totalSubjects: 0,
              overallStatus: null,
              riskCounts: { DANGER: 0, TIGHT: 0, ON_TRACK: 0, COMPLETE: 0, NEEDS_DATA: 0 },
              aggregateCoveragePct: null,
              totalRemainingHours: 0,
              totalAvailableHours: 0,
              totalHoursInScope: 0,
              totalCoveredHours: 0,
            },
          },
        }),
      );
    });

    renderReports();
    expect(await screen.findByText("No subjects match these filters")).toBeInTheDocument();
  });

  it("triggers CSV download on export button click", async () => {
    const csvContent = "Subject Code,Subject Name,Status\nCS101,Data Structures,ON_TRACK\n";
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/dashboard")) return new Response(JSON.stringify(dashboard));
      if (u.includes("/api/meta")) return new Response(JSON.stringify({ campuses: [campus] }));
      if (u.includes("/api/reports/export")) {
        return new Response(csvContent, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="prospectus-course-progress-report.csv"',
          },
        });
      }
      return new Response(JSON.stringify(courseProgressMock));
    });

    // Mock click on anchor elements so jsdom doesn't try to navigate
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createObjectURLMock = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURLMock = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLMock;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock;

    renderReports();
    const exportBtn = await screen.findByRole("button", { name: /Export CSV/i });
    await userEvent.click(exportBtn);

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalled();
    });
    clickSpy.mockRestore();
  });

  it("resets filters when clicking reset button", async () => {
    renderReports();
    await screen.findByRole("heading", { name: "Reports" });

    // Select a track filter
    const trackSelect = screen.getByLabelText("Track");
    await userEvent.selectOptions(trackSelect, "MIRAI");
    expect(trackSelect).toHaveValue("MIRAI");

    // Reset button appears and can be clicked
    const resetBtn = screen.getByRole("button", { name: "Reset filters" });
    await userEvent.click(resetBtn);

    expect(trackSelect).toHaveValue("");
  });
});
