import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { AppProvider } from "../context/AppContext";
import { ThemeProvider } from "../context/ThemeContext";
import type { Dashboard, StudentPortalData } from "../lib/types";

const campus = { id: "hi-tech", name: "HI-Tech" };
const dashboard: Dashboard = { dataSource: "live", generatedAt: "2026-10-20T00:00:00Z", campuses: [campus], context: { campus, semester: "Semester 3 (Mirai)", today: "2026-10-20" },
  state: { kind: "ready", message: "", subjects: 2, assessed: 2, unassessed: 0 }, metrics: { overallCoveragePct: 50, hoursBehind: 0, subjectsAtRisk: 0, nextExamInDays: null }, schedule: [], atRisk: [], exams: [], recentSessions: [] };
const portal = (over: Partial<StudentPortalData> = {}): StudentPortalData => ({
  asOf: "2026-10-20", batch: { id: "b1", name: "Mirai Batch A" }, campusId: "hi-tech", track: "MIRAI", semester: { name: "Semester 3", startsOn: "2026-08-03", endsOn: "2026-12-18" },
  overview: { subjectCount: 2, assessedSubjects: 2, overallCoveragePct: 66.7, coveredHours: 8, hoursInScope: 12, needAttention: 1 },
  subjects: [
    { id: "s1", code: "SMP101", name: "Programming Fundamentals", status: { key: "on_track", label: "On track" }, coveragePct: 80, hoursInScope: 10, coveredHours: 8, remainingHours: 2,
      coveredTopics: [{ title: "Variables", unitTitle: "Unit 1", completionPct: 100 }, { title: "Loops", unitTitle: "Unit 1", completionPct: 50 }],
      upcomingTopics: [{ title: "Loops", unitTitle: "Unit 1", completionPct: 50, expectedBy: "2026-10-27" }, { title: "Functions", unitTitle: "Unit 2", completionPct: 0, expectedBy: null }] },
    { id: "s2", code: "SMP102", name: "Discrete Mathematics", status: { key: "needs_attention", label: "Needs attention" }, coveragePct: 0, hoursInScope: 2, coveredHours: 0, remainingHours: 2, coveredTopics: [], upcomingTopics: [{ title: "Sets", unitTitle: "Unit 1", completionPct: 0, expectedBy: null }] },
  ],
  upcomingClasses: [{ date: "2026-10-21", startTime: "09:00", endTime: "10:00", subjectName: "Programming Fundamentals", subjectCode: "SMP101", room: "R-101", kind: "scheduled" }],
  exams: [{ id: "e1", name: "Mid-term", typeLabel: "Mid-term", startsOn: "2026-10-26", endsOn: "2026-10-30", daysToStart: 6, phase: "upcoming", classesEnd: "2026-10-25",
    subjects: [{ name: "Programming Fundamentals", code: "SMP101", status: { key: "on_track", label: "On track" }, coveragePct: 90, remainingHours: 1, teachingHoursLeft: 4, scope: "These topics are assessed in this exam", scopeTopics: [{ title: "Variables", unitTitle: "Unit 1", completionPct: 100 }, { title: "Loops", unitTitle: "Unit 1", completionPct: 50 }] }] }],
  ...over,
});

interface Opts { cfg?: { sessionLogin: boolean; demoHeaders: boolean }; user?: object | null; portalResponse?: () => Response; batches?: unknown[] }
const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });
function server(o: Opts = {}) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const u = String(input); calls.push({ url: u, method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string> });
    if (u.includes("/api/auth/config")) return new Response(JSON.stringify(o.cfg ?? { sessionLogin: true, demoHeaders: false }));
    if (u.includes("/api/auth/session")) return new Response(JSON.stringify({ user: o.user === undefined ? { email: "s@x.edu", role: "student", name: null, facultyId: null, batchId: "b1" } : o.user }));
    if (u.includes("/api/student/portal")) return (o.portalResponse ?? json(portal()))();
    if (u.includes("/api/batches")) return new Response(JSON.stringify({ batches: o.batches ?? [{ id: "b1", name: "Mirai Batch A", semesterName: "Semester 3" }] }));
    return new Response(JSON.stringify(dashboard));
  }));
  return calls;
}
const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><ThemeProvider><AppProvider><App /></AppProvider></ThemeProvider></MemoryRouter>);
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("student portal (signed-in student)", () => {
  it("shows the student's batch, hour-weighted overview, each subject's covered/remaining hours and status, coming classes and exams with scope", async () => {
    const calls = server();
    renderAt("/my-learning");
    expect(await screen.findByRole("heading", { level: 1, name: "My learning" })).toBeInTheDocument();
    expect(await screen.findByText(/Mirai Batch A · HI-Tech · Mirai Track · Semester 3/)).toBeInTheDocument();
    const overview = screen.getByRole("list", { name: "Overview" });
    expect(within(overview).getByText("66.7%")).toBeInTheDocument();
    expect(within(overview).getByText(/8 h of 12 h across your subjects/)).toBeInTheDocument();
    expect(within(overview).getByText("Need attention").nextElementSibling).toHaveTextContent("1");
    const subjects = screen.getByRole("region", { name: "My subjects" });
    expect(within(subjects).getByText("80% covered")).toBeInTheDocument();
    expect(within(subjects).getByText(/8 h of 10 h · 2 h to go/)).toBeInTheDocument();
    expect(within(subjects).getByRole("progressbar", { name: "Programming Fundamentals syllabus covered" })).toHaveAttribute("aria-valuenow", "80");
    expect(within(subjects).getByText("On track")).toBeInTheDocument();
    expect(within(subjects).getByText("Needs attention")).toBeInTheDocument();
    await userEvent.click(within(subjects).getAllByRole("button", { name: "Topics" })[0]!);
    expect(within(subjects).getByText(/around 27 Oct/)).toBeInTheDocument();
    const coming = screen.getByRole("region", { name: "Coming up" });
    expect(within(coming).getByText("Programming Fundamentals")).toBeInTheDocument();
    expect(within(coming).getByText(/09:00–10:00 · R-101/)).toBeInTheDocument();
    const exams = screen.getByRole("region", { name: "Upcoming exams" });
    expect(within(exams).getByText("Mid-term", { selector: "h3" })).toBeInTheDocument();
    expect(within(exams).getByText(/In 6 days/)).toBeInTheDocument();
    expect(within(exams).queryByText(/These topics are assessed in this exam/)).toBeNull(); // the Topics list says it; the line was repeated under every subject
    await userEvent.click(within(exams).getByRole("button", { name: "Topics (2)" }));
    expect(within(exams).getByText(/Loops/)).toBeInTheDocument();
    // the request carries no batch choice and no spoofable headers; no staff-only jargon is shown
    const req = calls.find((c) => c.url.includes("/api/student/portal"))!;
    expect(req.url).toBe("/api/student/portal");
    expect(JSON.stringify(req.headers)).not.toMatch(/X-Demo/i);
    expect(screen.queryByText(/buffer/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add|Edit|Delete|Save|Log a session/i })).not.toBeInTheDocument();
  });

  it("student navigation has My learning; the page is not offered to staff roles", async () => {
    server();
    renderAt("/");
    const nav = (await screen.findAllByRole("navigation", { name: "Primary" }))[0]!;
    expect(await within(nav).findByRole("link", { name: "My learning" })).toHaveAttribute("href", "/my-learning");
    expect(within(nav).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
    server({ user: { email: "a@x.edu", role: "admin", name: null, facultyId: null, batchId: null } });
    renderAt("/my-learning");
    expect(await screen.findByText(/My learning isn't available to the Administrator role|isn't available to the Admin role/)).toBeInTheDocument();
  });

  it("explains an account with no batch instead of showing anything", async () => {
    server({ portalResponse: json({ error: "no_batch_assigned", message: "Your account is not linked to a batch yet" }, 409) });
    renderAt("/my-learning");
    expect(await screen.findByText("Your account isn't linked to a batch yet")).toBeInTheDocument();
    expect(screen.queryByText("Syllabus covered")).not.toBeInTheDocument();
  });

  it("shows honest empty states: no subjects, no classes, no exams, and a subject without a syllabus", async () => {
    server({ portalResponse: json(portal({ overview: { subjectCount: 0, assessedSubjects: 0, overallCoveragePct: null, coveredHours: 0, hoursInScope: 0, needAttention: 0 }, subjects: [], upcomingClasses: [], exams: [] })) });
    renderAt("/my-learning");
    expect(await screen.findByText("No subjects yet")).toBeInTheDocument();
    expect(screen.getByText("No classes planned in the next two weeks")).toBeInTheDocument();
    expect(screen.getByText("No exams scheduled yet")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument(); // no invented percentages
    vi.unstubAllGlobals();
    server({ portalResponse: json(portal({ subjects: [{ ...portal().subjects[0]!, coveragePct: null, hoursInScope: 0, coveredHours: 0, remainingHours: 0, status: { key: "no_data", label: "Not enough information yet" }, coveredTopics: [], upcomingTopics: [] }] })) });
    renderAt("/my-learning");
    expect(await screen.findByText(/syllabus for this subject has not been added yet/)).toBeInTheDocument();
  });

  it("shows loading, then an error with retry that recovers", async () => {
    let n = 0;
    server({ portalResponse: () => (n++ === 0 ? new Response(JSON.stringify({ error: "internal_error", message: "Something went wrong on the server" }), { status: 500 }) : new Response(JSON.stringify(portal()))) });
    renderAt("/my-learning");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Something went wrong/);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("66.7%")).toBeInTheDocument();
  });
});

describe("student portal (development demo preview)", () => {
  it("asks which batch to preview, then sends it as the labelled demo header — and only for the student role", async () => {
    localStorage.setItem("prospectus.role", "student");
    const calls = server({ cfg: { sessionLogin: false, demoHeaders: true }, user: null });
    renderAt("/my-learning");
    expect(await screen.findByText("Choose a batch to preview")).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/api/student/portal"))).toBe(false); // nothing is fetched until a batch is chosen
    await userEvent.selectOptions(await screen.findByLabelText(/Preview as a student of batch/), "b1");
    expect(await screen.findByText("66.7%")).toBeInTheDocument();
    const req = calls.filter((c) => c.url.includes("/api/student/portal")).pop()!;
    expect(req.headers["X-Demo-Role"]).toBe("student");
    expect(req.headers["X-Demo-Batch"]).toBe("b1");
    expect(req.url).toBe("/api/student/portal");
  });
});
