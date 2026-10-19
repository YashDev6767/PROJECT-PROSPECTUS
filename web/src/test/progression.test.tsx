import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { ToastProvider } from "../components/ui/Toast";
import { AppProvider } from "../context/AppContext";
import { ThemeProvider } from "../context/ThemeContext";
import type { Dashboard, ScheduleItem, SessionLog, SubjectDetail, SubjectProgress, SubjectSummary } from "../lib/types";

const campus = { id: "hi-tech", name: "HI-Tech" };
const liveDashboard: Dashboard = {
  dataSource: "live", generatedAt: "2026-10-16T00:00:00Z", campuses: [campus], context: { campus, semester: "Semester 3 (Mirai)", today: "2026-10-16" },
  overall: { status: "DANGER", worstSubject: { id: "sub1", name: "Database Concepts", batchName: "Mirai Batch A" }, byTrack: [{ track: "MIRAI", status: "DANGER" }, { track: "UNIVERSITY", status: "ON_TRACK" }] },
  metrics: { overallCoveragePct: 61.5, hoursBehind: 12, subjectsAtRisk: 2, nextExamInDays: 10 },
  schedule: [{ id: "k1", subject: "Programming Fundamentals", code: "Mirai Batch A", start: "09:00", end: "10:00", room: "R1", state: "needs_log", subjectId: "sub1" }],
  atRisk: [{ id: "sub1", code: "SMP103", name: "Database Concepts", faculty: "Faculty Three", batchName: "Mirai Batch A", coveragePct: 44.4, expectedPct: 75, hoursBehind: 11, risk: "critical", daysToExam: 52, status: "DANGER", reason: "Not enough time: only 11 h of teaching left for 20.01 h of syllabus (buffer 0.55, below 1.00).", bufferRatio: 0.55 }],
  exams: [{ id: "e1", name: "Mid-term", examDate: "2026-10-26", daysToExam: 10, subtitle: "Mid-term · Mirai · whole cohort" }],
  recentSessions: [{ id: "l1", subject: "Data Structures", code: "Mirai Batch A", faculty: "Faculty One", hours: 1, topics: "Sample Topic 1.2 (60%)", date: "2026-10-15" }],
};

const topic = (n: number, over: Partial<SubjectProgress["topics"][number]> = {}) => ({ topicId: `t${n}`, title: `Topic ${n}`, unitTitle: "Unit 1", plannedHours: 3, status: "not_started" as const, completionPct: 0, coveredHours: 0, remainingHours: 3, plannedStart: "2026-09-07", plannedEnd: "2026-09-21", forecastEnd: "2026-11-02", overdue: false, ...over });
const progress = (over: Partial<SubjectProgress> = {}): SubjectProgress => ({
  risk: "DANGER", headline: "Not enough time: only 12.5 h of teaching left for 14 h of syllabus (buffer 0.89, below 1.00).", reasons: ["Short by 1.5 h before the deadline.", "8 h behind the original plan (2 h covered vs 10 h planned so far)."],
  hoursInScope: 16, coveredHours: 2, remainingHours: 14, coveragePct: 12.5, plannedToDateHours: 10, paceHours: -8, availableHours: 12.5, bufferRatio: 0.89, projectedCompletion: "2026-11-11", projectionNote: "",
  overdueTopics: [{ topicId: "t1", title: "Topic 1", plannedEnd: "2026-09-16", completionPct: 50 }], unloggedPastSessions: 2, remainingSessions: 8,
  topics: [topic(1, { status: "in_progress", completionPct: 50, coveredHours: 1.5, remainingHours: 1.5, overdue: true }), topic(2), topic(3, { status: "completed", completionPct: 100, coveredHours: 3, remainingHours: 0 })],
  thresholds: { onTrack: 1.15, tight: 1 }, ...over,
});
const detail: SubjectDetail = {
  asOf: "2026-10-05", referenceDate: "2026-10-05", thresholds: { onTrack: 1.15, tight: 1 },
  subject: { id: "sub1", code: "SMP103", name: "Database Concepts", batchId: "b1", batchName: "Mirai Batch A", semesterId: "sem1", semesterName: "Semester 3", campusId: "hi-tech", track: "MIRAI", facultyId: "f1", facultyName: "Faculty One", isSample: true },
  deadline: { date: "2026-11-09", lastTeachingDate: "2026-11-08", source: "exam", label: "End-term starts 2026-11-09" },
  progress: progress(), hoursTaught: 5, sessionsLogged: 4, lastLoggedOn: "2026-09-16", teachingCapacityHours: 40, weeklyHours: 3.5, recentLogs: [],
};
const item = (over: Partial<ScheduleItem> = {}): ScheduleItem => ({
  key: "e1@2026-10-05", kind: "scheduled", date: "2026-10-05", subjectId: "sub1", subjectCode: "SMP103", subjectName: "Database Concepts", batchId: "b1", batchName: "Mirai Batch A", semesterId: "sem1", campusId: "hi-tech", track: "MIRAI",
  facultyId: "f1", facultyName: "Faculty One", entryId: "e1", makeupOfLogId: null, startTime: "09:00", endTime: "10:00", hours: 1, room: "R1", log: null, ...over,
});
const summary = (over: Partial<SubjectSummary> = {}): SubjectSummary => ({ id: "sub1", code: "SMP103", name: "Database Concepts", batchId: "b1", batchName: "Mirai Batch A", semesterId: "sem1", semesterName: "Semester 3", campusId: "hi-tech", track: "MIRAI", facultyName: "Faculty One", risk: "DANGER", headline: "", coveragePct: 12.5, hoursInScope: 16, coveredHours: 2, remainingHours: 14, availableHours: 12.5, bufferRatio: 0.89, paceHours: -8, projectedCompletion: null, deadline: "2026-11-09", deadlineLabel: "", overdueCount: 1, unloggedPastSessions: 0, ...over });
const loggedRow = (over: Partial<SessionLog> = {}): SessionLog => ({
  id: "log1", subjectId: "sub1", subjectCode: "SMP103", subjectName: "Database Concepts", batchId: "b1", batchName: "Mirai Batch A", semesterId: "sem1", campusId: "hi-tech", track: "MIRAI", facultyId: "f1", facultyName: "Faculty One",
  timetableEntryId: "e1", makeupOfId: null, mergedIntoId: null, heldOn: "2026-10-05", slotStart: "09:00", slotEnd: "10:00", scheduledHours: 1, actualHours: null, hoursTaught: 1, outcome: "IN_PROGRESS", rescheduledTo: null,
  covered: [{ topicId: "t1", title: "Topic 1", unitTitle: "Unit 1", completionPct: 50 }], leftover: [], skipped: [], carryForward: null, classworkStatus: "NOT_GIVEN", homeworkStatus: "NOT_GIVEN", notes: null, revision: 1,
  reviewedAt: null, reviewedByRole: null, reviewNote: null, loggedByRole: "faculty", loggedByFacultyName: "Faculty One", createdAt: "2026-10-05T08:00:00Z", updatedAt: "2026-10-05T08:00:00Z", isSample: false, ...over,
});

type Handler = (url: URL, init?: RequestInit) => { status?: number; body?: unknown } | undefined;
const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function mockApi(handler: Handler, dashboard: Dashboard = liveDashboard) {
  const calls: Array<{ method: string; path: string; body: unknown; headers: Record<string, string> }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, "http://localhost");
    calls.push({ method: init?.method ?? "GET", path: url.pathname + url.search, body: init?.body ? JSON.parse(init.body as string) : undefined, headers: (init?.headers ?? {}) as Record<string, string> });
    if (url.pathname === "/api/dashboard") return json(200, dashboard);
    const r = handler(url, init);
    return r ? json(r.status ?? 200, r.body) : json(404, { error: "not_found", message: "unmocked " + url.pathname });
  }));
  return calls;
}
const renderAt = (path: string, role: string, extra: Record<string, string> = {}) => {
  localStorage.setItem("prospectus.role", role);
  for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
  return render(<MemoryRouter initialEntries={[path]}><ThemeProvider><AppProvider><ToastProvider><App /></ToastProvider></AppProvider></ThemeProvider></MemoryRouter>);
};

beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-05T10:00:00") }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Overview with live data", () => {
  it("shows the overall status (worst subject), the reason for each risk, and labels the data as live", async () => {
    mockApi(() => undefined);
    renderAt("/", "admin");
    expect(await screen.findByText("Overall status")).toBeInTheDocument();
    expect(screen.getByText("Live data")).toBeInTheDocument();
    expect(screen.getAllByText("Danger").length).toBeGreaterThan(0);
    expect(screen.getByText(/decided by the worst subject/)).toBeInTheDocument();
    expect(screen.getByText(/buffer 0.55, below 1.00/)).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Database Concepts" })) expect(link).toHaveAttribute("href", "/subjects/sub1");
    expect(screen.queryByText(/built-in demonstration dataset/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log pending" })).toHaveAttribute("href", "/session-logs");
  });
});

describe("Subject progress page", () => {
  const handler: Handler = (u) => (u.pathname === "/api/progression/subjects/sub1" ? { body: { ...detail, asOf: u.searchParams.get("asOf") ?? "2026-10-05" } } : undefined);

  it("explains WHY, shows every required number, overdue topics and per-topic dates", async () => {
    mockApi(handler);
    renderAt("/subjects/sub1", "campus_manager");
    expect(await screen.findByText(/Why: Not enough time/)).toBeInTheDocument();
    const why = screen.getByRole("region", { name: "Why this status" });
    expect(within(why).getByText("Short by 1.5 h before the deadline.")).toBeInTheDocument();
    expect(within(why).getByText(/On track ≥ 1.15 · Tight ≥ 1.00/)).toBeInTheDocument();
    const nums = within(screen.getByRole("list", { name: "Progress numbers" }));
    expect(nums.getByText("Planned hours in scope").nextElementSibling).toHaveTextContent("16 h");
    expect(nums.getByText("Buffer ratio").nextElementSibling).toHaveTextContent("0.89");
    expect(nums.getByText("Pace vs plan").nextElementSibling).toHaveTextContent("-8.00 h");
    expect(nums.getByText("Projected completion").nextElementSibling).toHaveTextContent("11 Nov");
    expect(screen.getByText("Overdue topics (1)")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Topic progress" });
    expect(within(table).getByText("Overdue")).toBeInTheDocument();
    expect(within(table).getByText("Done")).toBeInTheDocument();
    expect(screen.getByText(/2 earlier class\(es\) have no log/)).toBeInTheDocument();
  });

  it("refetches with the chosen what-if date", async () => {
    const calls = mockApi(handler);
    renderAt("/subjects/sub1", "admin");
    await screen.findByText(/Why: /);
    await userEvent.type(screen.getByLabelText(/As of date/), "2026-10-20");
    await waitFor(() => expect(calls.some((c) => c.path.includes("asOf=2026-10-20"))).toBe(true));
  });

  it("handles a subject with no syllabus without NaN or crashes", async () => {
    mockApi((u) => (u.pathname === "/api/progression/subjects/sub1" ? { body: { ...detail, progress: progress({ risk: "UNKNOWN", headline: "No syllabus hours in scope, so progress cannot be measured.", reasons: [], hoursInScope: 0, coveredHours: 0, remainingHours: 0, coveragePct: null, bufferRatio: null, availableHours: 0, projectedCompletion: null, overdueTopics: [], topics: [], unloggedPastSessions: 0 }) } } : undefined));
    renderAt("/subjects/sub1", "admin");
    expect(await screen.findByText(/No syllabus hours in scope/)).toBeInTheDocument();
    expect(screen.getByText("No syllabus topics yet")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });
});

describe("Session Logs page", () => {
  const faculty = { faculty: [{ id: "f1", name: "Faculty One" }, { id: "f2", name: "Faculty Two" }] };
  const base: Handler = (u) => {
    if (u.pathname === "/api/faculty") return { body: faculty };
    if (u.pathname === "/api/session-logs/schedule") return { body: { date: "2026-10-05", today: "2026-10-05", items: [item()], notices: [] } };
    if (u.pathname === "/api/session-logs/pending") return { body: { from: "2026-09-21", to: "2026-10-04", items: [item({ key: "e1@2026-09-28", date: "2026-09-28" })] } };
    if (u.pathname === "/api/progression/subjects/sub1") return { body: detail };
    return undefined;
  };

  it("asks faculty who they are before showing anything (demo identity)", async () => {
    mockApi(base);
    renderAt("/session-logs", "faculty");
    expect(await screen.findByText("Choose who you are")).toBeInTheDocument();
    expect(screen.queryByText("Database Concepts")).not.toBeInTheDocument();
  });

  it("shows today's classes and the earlier ones that still need a log, sends the demo identity header", async () => {
    const calls = mockApi(base);
    renderAt("/session-logs", "faculty", { "prospectus.faculty": "f1" });
    expect(await screen.findByText(/Classes on .*\(today\)/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Log session for Database Concepts/ })).toHaveLength(2); // today + one pending
    expect(screen.getByText(/Earlier classes that still need a log/)).toBeInTheDocument();
    const schedule = calls.find((c) => c.path.startsWith("/api/session-logs/schedule"))!;
    expect(schedule.path).toContain("facultyId=f1");
    expect(schedule.headers["X-Demo-Faculty"]).toBe("f1");
    expect(schedule.headers["X-Demo-Role"]).toBe("faculty");
  });

  it("logs a session in a few taps: prefilled header, mark a topic Done, Save, and see the effect on progress", async () => {
    const calls = mockApi((u, init) => {
      if (u.pathname === "/api/session-logs" && init?.method === "POST") return { status: 201, body: { log: loggedRow(), progress: { before: summary({ coveragePct: 12.5 }), after: summary({ coveragePct: 18.8, bufferRatio: 0.95 }) } } };
      return base(u, init);
    });
    renderAt("/session-logs", "faculty", { "prospectus.faculty": "f1" });
    await userEvent.click(await screen.findByRole("button", { name: /Log session for Database Concepts, Mirai Batch A, 5 Oct/ }));
    const dialog = await screen.findByRole("dialog", { name: "Log a session" });
    expect(await within(dialog).findByText(/09:00–10:00 · 1 h scheduled/)).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: "Completed" })).toHaveAttribute("aria-checked", "true");
    const t2 = within(dialog).getByRole("group", { name: "Topic 2 progress this session" });
    await userEvent.click(within(t2).getByRole("button", { name: "Done" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save log" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const post = calls.find((c) => c.method === "POST" && c.path === "/api/session-logs")!;
    expect(post.body).toMatchObject({ subjectId: "sub1", heldOn: "2026-10-05", timetableEntryId: "e1", outcome: "COMPLETED", covered: [{ topicId: "t2", completionPct: 100 }], makeupOfId: null });
    expect(await screen.findByText(/Session logged — Coverage 12.5% → 18.8% · buffer 0.95/)).toBeInTheDocument();
  });

  it("records a partly covered topic with its percentage", async () => {
    const calls = mockApi((u, init) => (u.pathname === "/api/session-logs" && init?.method === "POST" ? { status: 201, body: { log: loggedRow(), progress: { before: null, after: null } } } : base(u, init)));
    renderAt("/session-logs", "admin");
    await userEvent.click(await screen.findByRole("button", { name: /Log session for Database Concepts, Mirai Batch A, 5 Oct/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: "In progress" }));
    await userEvent.click(within(await within(dialog).findByRole("group", { name: "Topic 2 progress this session" })).getByRole("button", { name: "Partly" }));
    const pct = within(dialog).getByLabelText("Total completion after this session");
    await userEvent.clear(pct);
    await userEvent.type(pct, "40");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save log" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ outcome: "IN_PROGRESS", covered: [{ topicId: "t2", completionPct: 40 }] });
  });

  it("shows server validation next to the form and keeps the dialog open; a duplicate points at correcting", async () => {
    let n = 0;
    mockApi((u, init) => {
      if (u.pathname === "/api/session-logs" && init?.method === "POST") {
        n++;
        return n === 1
          ? { status: 400, body: { error: "validation_failed", message: "bad", issues: [{ path: "covered", message: "A completed session needs at least one topic covered, or a note explaining why none." }] } }
          : { status: 409, body: { error: "duplicate_log", message: 'This session already has a log. Open it and use "Correct this log" instead of creating another.', existingLogId: "log1" } };
      }
      return base(u, init);
    });
    renderAt("/session-logs", "admin");
    await userEvent.click(await screen.findByRole("button", { name: /Log session for Database Concepts, Mirai Batch A, 5 Oct/ }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(/09:00–10:00/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save log" }));
    expect(await within(dialog).findByText(/needs at least one topic covered/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save log" }));
    expect(await within(dialog).findByText(/Correct this log/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("adapts the form to the outcome: cancelled asks for a reason and a reschedule date, merged asks for the primary session", async () => {
    mockApi((u, init) => {
      if (u.pathname === "/api/session-logs/schedule") return { body: { date: "2026-10-05", today: "2026-10-05", notices: [], items: [item(), item({ key: "other", subjectId: "sub2", subjectName: "Maths", entryId: "e9", log: { id: "primary1", outcome: "COMPLETED", revision: 1, reviewed: false } })] } };
      return base(u, init);
    });
    renderAt("/session-logs", "admin");
    await userEvent.click(await screen.findByRole("button", { name: /Log session for Database Concepts, Mirai Batch A, 5 Oct/ }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(/09:00–10:00/);
    await userEvent.click(within(dialog).getByRole("radio", { name: "Cancelled" }));
    expect(within(dialog).getByLabelText("Reason")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Reschedule to/)).toBeInTheDocument();
    expect(within(dialog).queryByText("What did you cover?")).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("radio", { name: "Merged" }));
    expect(within(dialog).getByRole("option", { name: /Maths — Mirai Batch A/ })).toBeInTheDocument();
    expect(within(dialog).getByText("What did you cover?")).toBeInTheDocument();
  });

  it("corrects an existing log: prefilled, with a mandatory correction note, sent as PATCH", async () => {
    const calls = mockApi((u, init) => {
      if (u.pathname === "/api/session-logs/schedule") return { body: { date: "2026-10-05", today: "2026-10-05", notices: [], items: [item({ log: { id: "log1", outcome: "IN_PROGRESS", revision: 1, reviewed: false } })] } };
      if (u.pathname === "/api/session-logs/log1" && (init?.method ?? "GET") === "GET") return { body: { ...loggedRow(), revisions: [], mergedLogs: [] } };
      if (u.pathname === "/api/session-logs/log1" && init?.method === "PATCH") return { body: { log: loggedRow({ revision: 2 }), progress: { before: null, after: null } } };
      return base(u, init);
    });
    renderAt("/session-logs", "admin");
    await userEvent.click(await screen.findByRole("button", { name: /Correct log for Database Concepts, Mirai Batch A, 5 Oct/ }));
    const dialog = await screen.findByRole("dialog", { name: "Correct this log" });
    expect(await within(dialog).findByText(/already has a log \(revision 1\)/)).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: "In progress" })).toHaveAttribute("aria-checked", "true");
    await userEvent.type(within(dialog).getByLabelText(/Why are you correcting this log/), "Typo in percentage");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save correction" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")!.body).toMatchObject({ correctionNote: "Typo in percentage", outcome: "IN_PROGRESS", covered: [{ topicId: "t1", completionPct: 50 }] });
  });

  it("explains why a day has no classes, and blocks students entirely", async () => {
    mockApi((u, init) => (u.pathname === "/api/session-logs/schedule" ? { body: { date: "2026-10-02", today: "2026-10-05", items: [], notices: [{ date: "2026-10-02", campusId: "hi-tech", semesterName: "Sem", reason: "holiday" }] } } : base(u, init)));
    const { unmount } = renderAt("/session-logs?date=2026-10-02", "admin");
    expect(await screen.findByText(/treats this day as a holiday/)).toBeInTheDocument();
    unmount();
    renderAt("/session-logs", "student");
    expect(await screen.findByText(/isn't available to the Student role/)).toBeInTheDocument();
  });

  it("History lets managers review a log but not faculty", async () => {
    const hist: Handler = (u, init) => (u.pathname === "/api/session-logs" ? { body: { logs: [loggedRow()] } } : u.pathname === "/api/session-logs/log1" ? { body: { ...loggedRow(), revisions: [], mergedLogs: [] } } : base(u, init));
    mockApi(hist);
    const { unmount } = renderAt("/session-logs", "campus_manager");
    await userEvent.click(await screen.findByRole("tab", { name: "History" }));
    await userEvent.click(await screen.findByRole("button", { name: /Details for Database Concepts/ }));
    expect(await screen.findByRole("button", { name: "Mark reviewed" })).toBeInTheDocument();
    unmount();
    mockApi(hist);
    renderAt("/session-logs", "faculty", { "prospectus.faculty": "f1" });
    await userEvent.click(await screen.findByRole("tab", { name: "History" }));
    await userEvent.click(await screen.findByRole("button", { name: /Details for Database Concepts/ }));
    await screen.findByText("Session log");
    expect(screen.queryByRole("button", { name: "Mark reviewed" })).not.toBeInTheDocument();
  });
});

describe("Subjects list shows progress status", () => {
  it("links each subject to its explanation and shows status, coverage and buffer", async () => {
    mockApi((u) => {
      if (u.pathname === "/api/semesters") return { body: { semesters: [{ id: "sem1", name: "Semester 3", academicYear: "2026-27", track: "MIRAI", campusId: "hi-tech", startsOn: "2026-08-03", endsOn: "2026-12-18", saturdayRule: "NONE", isActive: true, isSample: false, status: "active", batchCount: 1, examCount: 0 }] } };
      if (u.pathname === "/api/batches") return { body: { batches: [] } };
      if (u.pathname === "/api/subjects") return { body: { subjects: [{ id: "sub1", code: "SMP103", name: "Database Concepts", plannedHours: 36, isSample: false, batchId: "b1", batchName: "Mirai Batch A", semesterId: "sem1", semesterName: "Semester 3", campusId: "hi-tech", track: "MIRAI", facultyId: "f1", facultyName: "Faculty One", weeklyScheduledHours: 3, projectedSemesterHours: 42, syllabusPlannedHours: 36, topicCount: 12, progress: { risk: "TIGHT", headline: "Tight", coveragePct: 62, bufferRatio: 1.02, remainingHours: 13.7, availableHours: 14, paceHours: -5.7, overdueCount: 0 } }] } };
      return undefined;
    });
    renderAt("/subjects", "student");
    const link = await screen.findByRole("link", { name: /Progress details for Database Concepts, Mirai Batch A/ });
    expect(link).toHaveAttribute("href", "/subjects/sub1");
    expect(link).toHaveTextContent("Tight");
    expect(link).toHaveTextContent("62% · buffer 1.02");
  });
});

describe("smart carry-forward in the logging dialog", () => {
  const faculty = { faculty: [{ id: "f1", name: "Faculty One", email: null, campusId: "hi-tech", campusName: "HI-Tech", isSample: false, subjectCount: 1 }] };
  const carryBody = (items: unknown[], note: string | null = null) => ({ subjectId: "sub1", heldOn: "2026-10-05", source: items.length ? { logId: "prev", heldOn: "2026-09-28", outcome: "IN_PROGRESS" } : null, items, note });
  const c2 = { topicId: "t2", title: "Topic 2", unitTitle: "Unit 1", plannedHours: 3, reason: "in_progress", completionPct: 50, remainingHours: 1.5, fromDate: "2026-09-28", fromLogId: "prev" };
  const c3 = { topicId: "t3", title: "Topic 3", unitTitle: "Unit 1", plannedHours: 3, reason: "leftover", completionPct: 0, remainingHours: 3, fromDate: "2026-09-28", fromLogId: "prev" };
  const withCarry = (items: unknown[], note: string | null = null, extra?: Handler): Handler => (u, init) => {
    if (u.pathname === "/api/faculty") return { body: faculty };
    if (u.pathname === "/api/session-logs/schedule") return { body: { date: "2026-10-05", today: "2026-10-05", items: [item()], notices: [] } };
    if (u.pathname === "/api/session-logs/pending") return { body: { from: "2026-09-21", to: "2026-10-04", items: [] } };
    if (u.pathname === "/api/progression/subjects/sub1") return { body: detail };
    if (u.pathname === "/api/session-logs/carry-forward") return { body: carryBody(items, note) };
    return extra?.(u, init);
  };
  const open = async () => {
    await userEvent.click(await screen.findByRole("button", { name: /Log session for Database Concepts, Mirai Batch A, 5 Oct/ }));
    return screen.findByRole("dialog", { name: "Log a session" });
  };

  it("asks the API for the same subject and date, and shows each unfinished item with remaining work and its original date", async () => {
    const calls = mockApi(withCarry([c2, c3], "Finish Topic 2 proof"));
    renderAt("/session-logs", "faculty", { "prospectus.faculty": "f1" });
    const dialog = await open();
    const section = await within(dialog).findByRole("region", { name: "Carry forward from previous session" });
    expect(within(section).getByText(/50% done · 1.5 h left · from 28 Sep/)).toBeInTheDocument();
    expect(within(section).getByText(/Left over · 3 h · from 28 Sep/)).toBeInTheDocument();
    expect(within(section).getByText(/Finish Topic 2 proof/)).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/api/session-logs/carry-forward?subjectId=sub1&heldOn=2026-10-05")).toBe(true);
    expect(within(dialog).getAllByText("carried").length).toBeGreaterThan(0); // pinned & badged in the topic list too
  });

  it("prefills the form (all selected, note composed) without marking anything completed, and saves the selection as leftover", async () => {
    const calls = mockApi(withCarry([c2, c3], null, (u, init) => (u.pathname === "/api/session-logs" && init?.method === "POST" ? { status: 201, body: { log: loggedRow(), progress: { before: summary(), after: summary() } } } : undefined)));
    renderAt("/session-logs", "faculty", { "prospectus.faculty": "f1" });
    const dialog = await open();
    const box2 = await within(dialog).findByRole("checkbox", { name: "Carry forward Topic 2" });
    const box3 = within(dialog).getByRole("checkbox", { name: "Carry forward Topic 3" });
    await waitFor(() => { expect(box2).toBeChecked(); expect(box3).toBeChecked(); }); // the pre-selection lands one render after the list appears
    for (const g of ["Topic 2"]) expect(within(within(dialog).getByRole("group", { name: `${g} progress this session` })).getByRole("button", { name: "Not today" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(box3); // select only some items
    const t1 = within(dialog).getByRole("group", { name: "Topic 1 progress this session" });
    await userEvent.click(within(t1).getByRole("button", { name: "Done" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save log" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const post = calls.find((c) => c.method === "POST" && c.path === "/api/session-logs")!;
    expect(post.body).toMatchObject({ outcome: "COMPLETED", covered: [{ topicId: "t1", completionPct: 100 }], leftover: ["t2"], skipped: [] });
    expect((post.body as { carryForward: string }).carryForward).toBe("Carried from 2026-09-28: Topic 2 (50% done, 1.5 h left)");
  });

  it("a carried topic that is taught in this session is recorded as covered, never as both covered and leftover", async () => {
    const calls = mockApi(withCarry([c2], null, (u, init) => (u.pathname === "/api/session-logs" && init?.method === "POST" ? { status: 201, body: { log: loggedRow(), progress: { before: summary(), after: summary() } } } : undefined)));
    renderAt("/session-logs", "faculty", { "prospectus.faculty": "f1" });
    const dialog = await open();
    await within(dialog).findByRole("checkbox", { name: "Carry forward Topic 2" });
    await userEvent.click(within(within(dialog).getByRole("group", { name: "Topic 2 progress this session" })).getByRole("button", { name: "Done" }));
    expect(within(dialog).getByText(/Being covered in this session/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save log" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const post = calls.find((c) => c.method === "POST" && c.path === "/api/session-logs")!;
    expect(post.body).toMatchObject({ covered: [{ topicId: "t2", completionPct: 100 }], leftover: [] });
  });

  it("changes nothing when there is no unfinished work: no section, no extra fields", async () => {
    mockApi(withCarry([]));
    renderAt("/session-logs", "faculty", { "prospectus.faculty": "f1" });
    const dialog = await open();
    await within(dialog).findByText(/09:00–10:00 · 1 h scheduled/);
    expect(within(dialog).queryByRole("region", { name: "Carry forward from previous session" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText("carried")).not.toBeInTheDocument();
  });

  it("does not offer carry-forward for a cancelled session", async () => {
    mockApi(withCarry([c2]));
    renderAt("/session-logs", "faculty", { "prospectus.faculty": "f1" });
    const dialog = await open();
    await within(dialog).findByRole("region", { name: "Carry forward from previous session" });
    await userEvent.click(within(dialog).getByRole("radio", { name: "Cancelled" }));
    expect(within(dialog).queryByRole("region", { name: "Carry forward from previous session" })).not.toBeInTheDocument();
  });

  it("when the lookup fails the dialog still works and says so quietly", async () => {
    mockApi((u, init) => (u.pathname === "/api/session-logs/carry-forward" ? { status: 500, body: { error: "internal_error", message: "boom" } } : withCarry([])(u, init)));
    renderAt("/session-logs", "faculty", { "prospectus.faculty": "f1" });
    const dialog = await open();
    expect(await within(dialog).findByText(/Carry-forward suggestions could not be loaded/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save log" })).toBeEnabled();
  });
});
