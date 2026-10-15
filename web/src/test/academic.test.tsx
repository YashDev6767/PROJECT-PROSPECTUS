import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { ToastProvider } from "../components/ui/Toast";
import { AppProvider } from "../context/AppContext";
import { ThemeProvider } from "../context/ThemeContext";
import type { Dashboard, MonthData, Semester } from "../lib/types";

const campus = { id: "hi-tech", name: "HI-Tech" };
const dashboard: Dashboard = {
  dataSource: "demo", generatedAt: "2026-10-16T00:00:00Z", campuses: [campus, { id: "ratnam", name: "Ratnam" }],
  context: { campus, semester: "Demo", today: "2026-10-16" },
  metrics: { overallCoveragePct: 50, hoursBehind: 10, subjectsAtRisk: 1, nextExamInDays: 5 }, schedule: [], atRisk: [], exams: [], recentSessions: [],
};
const semester: Semester = { id: "s1", name: "Semester 3", academicYear: "2026-27", track: "MIRAI", campusId: "hi-tech", startsOn: "2026-08-03", endsOn: "2026-12-18", saturdayRule: "SECOND_FOURTH", isActive: true, isSample: true, status: "active", batchCount: 2, examCount: 3 };

type Handler = (url: URL, init?: RequestInit) => { status?: number; body?: unknown } | undefined;
const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function mockApi(handler: Handler) {
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
const renderAt = (path: string, role: string) => {
  localStorage.setItem("prospectus.role", role);
  return render(<MemoryRouter initialEntries={[path]}><ThemeProvider><AppProvider><ToastProvider><App /></ToastProvider></AppProvider></ThemeProvider></MemoryRouter>);
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("Semesters page", () => {
  const list: Handler = (u, init) => (u.pathname === "/api/semesters" && (init?.method ?? "GET") === "GET" ? { body: { semesters: [semester] } } : undefined);

  it("lists semesters with derived status, sample marking and the demo-role header", async () => {
    const calls = mockApi(list);
    renderAt("/semesters", "admin");
    expect(await screen.findByText("Semester 3")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Sample")).toBeInTheDocument();
    expect(calls.find((c) => c.path.startsWith("/api/semesters"))?.headers["X-Demo-Role"]).toBe("admin");
  });

  it("is read-only for faculty", async () => {
    mockApi(list);
    renderAt("/semesters", "faculty");
    await screen.findByText("Semester 3");
    expect(screen.queryByRole("button", { name: /New semester/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit Semester 3/ })).not.toBeInTheDocument();
    expect(screen.getByText(/view but not change semesters/)).toBeInTheDocument();
  });

  it("shows server validation next to the field, then an overlap warning that needs explicit confirmation", async () => {
    let posts = 0;
    const calls = mockApi((u, init) => {
      if (init?.method === "POST") {
        posts++;
        if (posts === 1) return { status: 400, body: { error: "validation_failed", message: "bad", issues: [{ path: "endsOn", message: "End date cannot be before the start date" }] } };
        const body = JSON.parse(init.body as string) as { confirmOverlap?: boolean };
        return body.confirmOverlap ? { status: 201, body: { ...semester, id: "s2" } } : { status: 409, body: { error: "needs_confirmation", message: "x", warnings: [{ code: "semester_overlap", message: 'Overlaps "Semester 3" (2026-08-03 to 2026-12-18) for the same campus and track.' }] } };
      }
      return list(u, init);
    });
    renderAt("/semesters", "admin");
    await userEvent.click(await screen.findByRole("button", { name: /New semester/ }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Semester name"), "Semester 4");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create semester" }));
    expect(await within(dialog).findByText("End date cannot be before the start date")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Create semester" }));
    expect(await within(dialog).findByText(/Overlaps "Semester 3"/)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST").at(-1)?.body).not.toHaveProperty("confirmOverlap");

    await userEvent.click(within(dialog).getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.filter((c) => c.method === "POST").at(-1)?.body).toMatchObject({ confirmOverlap: true });
    expect(await screen.findByText("Semester 3 saved")).toBeInTheDocument();
  });
});

describe("Academic Calendar page", () => {
  const month: MonthData = {
    month: "2026-10", campusId: "hi-tech", track: "MIRAI", saturdayRule: "SECOND_FOURTH", ruleSource: "semester", semester: { id: "s1", name: "Semester 3", isActive: true },
    days: [
      { date: "2026-10-01", weekday: 4, working: true, reason: "weekday", entryIds: [], examIds: [] },
      { date: "2026-10-02", weekday: 5, working: false, reason: "holiday", entryIds: ["h"], examIds: [] },
      { date: "2026-10-03", weekday: 6, working: false, reason: "saturday_off", entryIds: [], examIds: [] },
      { date: "2026-10-04", weekday: 7, working: false, reason: "sunday", entryIds: [], examIds: [] },
      { date: "2026-10-31", weekday: 6, working: true, reason: "special_working_day", entryIds: ["s"], examIds: [] },
    ],
    entries: [
      { id: "h", title: "Gandhi Jayanti", category: "HOLIDAY", startsOn: "2026-10-02", endsOn: "2026-10-02", campusId: null, description: null, isSample: true },
      { id: "s", title: "Make-up Saturday", category: "SPECIAL_WORKING_DAY", startsOn: "2026-10-31", endsOn: "2026-10-31", campusId: "hi-tech", description: null, isSample: true },
    ],
    exams: [],
  };
  const handler: Handler = (u) => (u.pathname === "/api/calendar/month" ? { body: { ...month, month: u.searchParams.get("month") } } : undefined);

  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-16T10:00:00") }));
  afterEach(() => vi.useRealTimers());

  it("describes every day's working status in text (not colour alone) and shows the legend and rule", async () => {
    mockApi(handler);
    renderAt("/calendar", "admin");
    expect(await screen.findByRole("grid", { name: /October 2026/ })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: /2 October.*Holiday — not a working day.*Gandhi Jayanti/ })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: /3 October.*Saturday off/ })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: /4 October.*Sunday — not a working day/ })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: /31 October.*Special working day — classes run/ })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Legend" })).toHaveTextContent("Special working day");
    expect(screen.getByText(/2nd and 4th Saturdays working/)).toBeInTheDocument();
  });

  it("navigates months by requesting the next month, and switches to the agenda view", async () => {
    const calls = mockApi(handler);
    renderAt("/calendar", "admin");
    await screen.findByRole("grid");
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    await waitFor(() => expect(calls.some((c) => c.path.includes("month=2026-11"))).toBe(true));
    await userEvent.click(screen.getByRole("tab", { name: "Agenda" }));
    expect(await screen.findByText("Make-up Saturday")).toBeInTheDocument();
  });

  it("hides add/edit controls from roles that cannot write, and lets managers add a special working day", async () => {
    mockApi(handler);
    const { unmount } = renderAt("/calendar", "student");
    await screen.findByRole("grid");
    expect(screen.queryByRole("button", { name: /Add entry/ })).not.toBeInTheDocument();
    unmount();
    renderAt("/calendar", "campus_manager");
    await userEvent.click(await screen.findByRole("button", { name: /Add entry/ }));
    const category = within(screen.getByRole("dialog")).getByLabelText("Category");
    expect(within(category).getByRole("option", { name: "Special working day" })).not.toBeDisabled();
  });
});

describe("Timetable page", () => {
  const subjects = { subjects: [{ id: "sub1", code: "S1", name: "Subject One", batchName: "Batch A", facultyName: "Faculty One" }] };
  it("shows readable clash explanations from the API and keeps the dialog open", async () => {
    mockApi((u, init) => {
      if (u.pathname === "/api/semesters") return { body: { semesters: [semester] } };
      if (u.pathname === "/api/batches") return { body: { batches: [] } };
      if (u.pathname === "/api/faculty") return { body: { faculty: [] } };
      if (u.pathname === "/api/subjects") return { body: subjects };
      if (u.pathname === "/api/timetable" && init?.method === "POST") return { status: 409, body: { error: "timetable_conflict", message: "This slot clashes with existing timetable entries.", conflicts: [{ type: "faculty", message: "Faculty One already teaches Subject One to Batch A on Monday 09:00–10:00." }] } };
      if (u.pathname === "/api/timetable") return { body: { entries: [], totalWeeklyHours: 0 } };
      return undefined;
    });
    renderAt("/timetable", "campus_manager");
    expect(await screen.findByText("No classes scheduled")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: /Add class/ })[0]!);
    const dialog = screen.getByRole("dialog");
    await userEvent.selectOptions(await within(dialog).findByLabelText(/^Subject/), "sub1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add class" }));
    expect(await within(dialog).findByText("Faculty One already teaches Subject One to Batch A on Monday 09:00–10:00.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Syllabus page", () => {
  const payload = { subject: { id: "sub1", code: "S1", name: "Subject One", batchName: "Batch A", plannedHours: 6, isSample: true }, totalPlannedHours: 5,
    units: [{ id: "u1", title: "Unit A", topics: [{ id: "t1", title: "A1", plannedHours: 2, examScope: "SESSIONAL" }, { id: "t2", title: "A2", plannedHours: 3, examScope: null }] }] };

  it("labels sample syllabi, flags hour mismatches, and reorders topics before saving the explicit order", async () => {
    const calls = mockApi((u, init) => {
      if (u.pathname === "/api/subjects/sub1/syllabus" && init?.method === "PUT") return { body: payload };
      if (u.pathname === "/api/subjects/sub1/syllabus") return { body: payload };
      return undefined;
    });
    renderAt("/subjects/sub1/syllabus", "campus_manager");
    expect(await screen.findByText(/placeholder sample data/)).toBeInTheDocument();
    expect(screen.getByText(/differ by 1 h/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save syllabus" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move topic 1.2 up" }));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save syllabus" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!.body as { units: Array<{ topics: Array<{ id: string }> }> };
    expect(put.units[0]!.topics.map((t) => t.id)).toEqual(["t2", "t1"]);
  });

  it("is read-only for faculty", async () => {
    mockApi((u) => (u.pathname === "/api/subjects/sub1/syllabus" ? { body: payload } : undefined));
    renderAt("/subjects/sub1/syllabus", "faculty");
    expect(await screen.findByLabelText("Unit 1 title")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Import CSV" })).not.toBeInTheDocument();
  });

  it("shows every row-level import error and offers no way to commit an invalid file", async () => {
    mockApi((u, init) => {
      if (u.pathname.endsWith("/import/preview") && init?.method === "POST")
        return { body: { valid: false, rowCount: 3, units: [], totalPlannedHours: 0, existingTopicCount: 3, errors: [{ row: 2, field: "planned_hours", message: '"abc" is not a number' }, { row: 4, field: "unit", message: "Unit is required" }] } };
      if (u.pathname === "/api/subjects/sub1/syllabus") return { body: payload };
      return undefined;
    });
    renderAt("/subjects/sub1/syllabus", "admin");
    await userEvent.click(await screen.findByRole("button", { name: "Import CSV" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.upload(within(dialog).getByLabelText("Choose CSV file"), new File(["unit,topic,planned_hours\n"], "bad.csv", { type: "text/csv" }));
    expect(await within(dialog).findByText(/2 problem\(s\) found in 3 row\(s\)/)).toBeInTheDocument();
    const table = within(dialog).getByRole("table", { name: "Import errors by row" });
    expect(within(table).getByText('"abc" is not a number')).toBeInTheDocument();
    expect(within(table).getByText("Unit is required")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Replace syllabus|Import syllabus/ })).not.toBeInTheDocument();
  });
});

describe("database not connected", () => {
  it("shows setup guidance instead of fake data", async () => {
    mockApi((u) => (u.pathname === "/api/semesters" ? { status: 503, body: { error: "database_unavailable", message: "No database is configured." } } : undefined));
    renderAt("/semesters", "admin");
    expect(await screen.findByText("Database not connected")).toBeInTheDocument();
    expect(screen.getByText(/npm run db:embedded/)).toBeInTheDocument();
  });
});
