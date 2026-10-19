import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { AppProvider } from "../context/AppContext";
import { ThemeProvider } from "../context/ThemeContext";
import type { Dashboard, ExamReadinessExam, ExamReadinessResponse, ExamReadinessSubject } from "../lib/types";

const campus = { id: "hi-tech", name: "HI-Tech" };
const live = (over: Partial<Dashboard> = {}): Dashboard => ({
  dataSource: "live", generatedAt: "2026-10-16T00:00:00Z", campuses: [campus], context: { campus, semester: "Semester 3 (Mirai)", today: "2026-10-16" },
  overall: { status: "ON_TRACK", worstSubject: null, byTrack: [] }, state: { kind: "ready", message: "", subjects: 3, assessed: 3, unassessed: 0 },
  metrics: { overallCoveragePct: 80, hoursBehind: 0, subjectsAtRisk: 0, nextExamInDays: 10 }, schedule: [], atRisk: [], exams: [], recentSessions: [], ...over,
});

const respond = (routes: Record<string, () => Response>) => vi.stubGlobal("fetch", vi.fn(async (url: string) => {
  const hit = Object.keys(routes).find((k) => String(url).includes(k));
  return hit ? routes[hit]!() : new Response("{}", { status: 404 });
}));
const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });
const renderApp = (path: string) => render(<MemoryRouter initialEntries={[path]}><ThemeProvider><AppProvider><App /></AppProvider></ThemeProvider></MemoryRouter>);
beforeEach(() => { localStorage.clear(); localStorage.setItem("prospectus.role", "admin"); localStorage.setItem("prospectus.campus", "hi-tech"); });
afterEach(() => vi.unstubAllGlobals());

describe("Overview states (a failed or unknowable state is never a reassuring all-clear)", () => {
  it("a genuinely risk-free campus says so, with the number of subjects assessed", async () => {
    respond({ "/api/dashboard": json(live()) });
    renderApp("/");
    expect(await screen.findByText("No subjects at risk")).toBeInTheDocument();
    expect(screen.getByText(/All 3 subject\(s\) have enough teaching time/)).toBeInTheDocument();
  });
  it("subjects that cannot be assessed are not reported as risk-free", async () => {
    respond({ "/api/dashboard": json(live({ state: { kind: "ready", message: "2 of 3 subject(s) cannot be assessed yet (no syllabus hours or no deadline).", subjects: 3, assessed: 1, unassessed: 2 } })) });
    renderApp("/");
    expect(await screen.findByText(/No subjects at risk — but 2 of 3 can't be assessed/)).toBeInTheDocument();
    expect(screen.queryByText("No subjects at risk")).not.toBeInTheDocument();
  });
  it.each([
    ["no_active_semester", "No active semester", "1 ended"],
    ["no_subjects", "No subjects configured", "no subjects yet"],
    ["needs_data", "Nothing can be assessed yet", "none can be assessed"],
  ] as const)("%s shows a warning instead of metrics or an all-clear", async (kind, title, text) => {
    respond({ "/api/dashboard": json(live({ state: { kind, message: kind === "no_active_semester" ? "No semester is active (1 ended)." : kind === "no_subjects" ? "The active semester has no subjects yet." : "1 subject(s) exist but none can be assessed yet.", subjects: 0, assessed: 0, unassessed: 0 } })) });
    renderApp("/");
    const note = await screen.findByRole("status", { name: title });
    expect(within(note).getByText(/not an all-clear/i)).toBeInTheDocument();
    expect(note.textContent).toMatch(new RegExp(text, "i"));
    expect(screen.queryByText("Syllabus covered")).not.toBeInTheDocument();
    expect(screen.queryByText("No subjects at risk")).not.toBeInTheDocument();
  });
  it("a failed live dashboard shows an error with retry, never demo or zero numbers", async () => {
    respond({ "/api/dashboard": json({ error: "dashboard_unavailable", message: "The live dashboard could not be computed right now, so no academic status is shown." }, 503) });
    renderApp("/");
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be computed right now/);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("Syllabus covered")).not.toBeInTheDocument();
    expect(screen.queryByText(/No subjects at risk/)).not.toBeInTheDocument();
  });
  it("the demo dataset keeps its explicit label", async () => {
    const { state: _s, ...demo } = live({ dataSource: "demo" });
    respond({ "/api/dashboard": json(demo) });
    renderApp("/");
    expect(await screen.findByText(/demonstration dataset/i)).toBeInTheDocument();
  });
});

const subject = (over: Partial<ExamReadinessSubject> = {}): ExamReadinessSubject => ({
  subjectId: "s1", code: "SMP103", name: "Database Concepts", batchName: "Mirai Batch A", facultyName: "Dr Rao", isSample: false, status: "DANGER",
  headline: "Not enough time: only 4 h of teaching left for 9.5 h of syllabus (buffer 0.42, below 1.00).", reasons: [], scopeMode: "exam_scope", topicsInScope: 4, unscopedTopics: 1,
  hoursInScope: 12, coveredHours: 2.5, remainingHours: 9.5, coveragePct: 20.83, availableHours: 4, bufferRatio: 0.42, projectedCompletion: null, unloggedPastSessions: 0, ...over,
});
const exam = (over: Partial<ExamReadinessExam> = {}): ExamReadinessExam => ({
  id: "e1", name: "Mid-term", type: "MID_TERM", typeLabel: "Mid-term", startsOn: "2026-10-26", endsOn: "2026-10-30", daysToStart: 10, phase: "upcoming", lastTeachingDate: "2026-10-25", notes: null, isSample: false,
  semester: { id: "sem", name: "Semester 3", track: "MIRAI" }, batch: null, status: "DANGER", subjectCount: 2, unassessed: 1, note: "1 of 2 subject(s) cannot be assessed yet (no syllabus hours in scope).",
  subjects: [subject(), subject({ subjectId: "s2", code: "SMP104", name: "Professional Communication", status: "UNKNOWN", headline: "No syllabus hours in scope, so progress cannot be measured.", coveragePct: null, remainingHours: 0, availableHours: null, bufferRatio: null, hoursInScope: 0, coveredHours: 0, scopeMode: "whole_syllabus", topicsInScope: 0, unscopedTopics: 0 })], ...over,
});
const readiness = (over: Partial<ExamReadinessResponse> = {}): ExamReadinessResponse => ({ asOf: "2026-10-16", campusId: "hi-tech", thresholds: { onTrack: 1.15, tight: 1 }, state: "ready", message: "", exams: [exam()], ...over });

describe("Exam Readiness page", () => {
  it("shows real exam dates, track, semester and each subject's coverage, remaining hours, buffer and plain-language reason", async () => {
    respond({ "/api/dashboard": json(live()), "/api/exam-readiness": json(readiness()) });
    renderApp("/exam-readiness");
    expect(await screen.findByRole("heading", { level: 1, name: "Exam Readiness" })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: /Readiness of each subject for Mid-term/ });
    expect(screen.getByText(/26 Oct – 30 Oct|26 Oct/)).toBeInTheDocument();
    expect(screen.getByText(/Semester 3 · whole cohort · Mid-term/)).toBeInTheDocument();
    const row = within(table).getByText("Database Concepts").closest("tr")!;
    expect(within(row).getByText("Danger")).toBeInTheDocument();
    expect(row).toHaveTextContent("20.83%"); expect(row).toHaveTextContent("9.5 h"); expect(row).toHaveTextContent("4 h"); expect(row).toHaveTextContent("0.42");
    expect(row).toHaveTextContent(/Not enough time: only 4 h/);
    expect(row).toHaveTextContent("4 topic(s) assessed by this exam");
    expect(row).toHaveTextContent("1 topic(s) have no exam tag and are not counted");
  });
  it("an exam with an unassessable subject is flagged as incomplete data, with no coverage or score invented", async () => {
    respond({ "/api/dashboard": json(live()), "/api/exam-readiness": json(readiness()) });
    renderApp("/exam-readiness");
    const table = await screen.findByRole("table", { name: /Mid-term/ });
    expect(screen.getByRole("status")).toHaveTextContent(/configured, but its readiness is not fully known/);
    const row = within(table).getByText("Professional Communication").closest("tr")!;
    expect(within(row).getByText("Needs data")).toBeInTheDocument();
    expect(row).toHaveTextContent("Whole syllabus");
    expect(within(row).queryByRole("progressbar")).toBeNull();
    expect(row).not.toHaveTextContent("%");
  });
  it("an exam under way and an exam with no subjects are described honestly", async () => {
    respond({ "/api/dashboard": json(live()), "/api/exam-readiness": json(readiness({ exams: [exam({ phase: "in_progress", daysToStart: -1, status: null, subjectCount: 0, unassessed: 0, note: "This exam applies to a batch that has no subjects yet.", subjects: [] })] })) });
    renderApp("/exam-readiness");
    expect(await screen.findByText(/Under way — teaching has ended/)).toBeInTheDocument();
    expect(screen.getByText("No subjects")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/no subjects yet/);
  });
  it("empty states: no exams configured, and no active semester", async () => {
    respond({ "/api/dashboard": json(live()), "/api/exam-readiness": json(readiness({ state: "no_exams", message: "No upcoming exams are configured for the active semester. Add them under Exam Schedule.", exams: [] })) });
    const first = renderApp("/exam-readiness");
    expect(await screen.findByText("No upcoming exams configured")).toBeInTheDocument();
    first.unmount();
    respond({ "/api/dashboard": json(live()), "/api/exam-readiness": json(readiness({ state: "no_active_semester", message: "No semester is active for this campus today.", exams: [] })) });
    renderApp("/exam-readiness");
    expect(await screen.findByRole("status")).toHaveTextContent(/No active semester/);
  });
  it("an API failure is an error with retry, not an empty or green page", async () => {
    respond({ "/api/dashboard": json(live()), "/api/exam-readiness": json({ error: "internal_error", message: "Something went wrong on the server" }, 500) });
    renderApp("/exam-readiness");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Something went wrong/);
    expect(screen.queryByText("No upcoming exams configured")).not.toBeInTheDocument();
  });
});
