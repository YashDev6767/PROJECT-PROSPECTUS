import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { AppProvider } from "../context/AppContext";
import { ThemeProvider } from "../context/ThemeContext";
import type { Dashboard } from "../lib/types";

const campus = { id: "c1", name: "Test Campus", city: "X" };
const dashboard: Dashboard = {
  dataSource: "demo", generatedAt: "2026-10-16T00:00:00Z", campuses: [campus],
  context: { campus, semester: "Sem 3 (Demo)", today: "2026-10-16" },
  metrics: { overallCoveragePct: 61.2, hoursBehind: 20, subjectsAtRisk: 1, nextExamInDays: 17 },
  schedule: [{ id: "t", subject: "Discrete Mathematics", code: "MA210", start: "13:00", end: "14:30", room: "A-301", state: "upcoming" }],
  atRisk: [{ id: "s", code: "MA210", name: "Discrete Mathematics", faculty: "P. Nair", coveragePct: 31, expectedPct: 62, hoursBehind: 14, risk: "critical", daysToExam: 17 }],
  exams: [{ id: "s", name: "Discrete Mathematics", risk: "critical", daysToExam: 17, examDate: "2026-11-02" }],
  recentSessions: [],
};

const renderApp = (path = "/") => render(<MemoryRouter initialEntries={[path]}><ThemeProvider><AppProvider><App /></AppProvider></ThemeProvider></MemoryRouter>);

beforeEach(() => { localStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe("Overview", () => {
  it("renders dashboard data and labels it as demo data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(dashboard))));
    renderApp();
    expect(await screen.findByText("Syllabus covered")).toBeInTheDocument();
    expect(screen.getByText("61.2%")).toBeInTheDocument();
    expect(screen.getByText(/demonstration dataset/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /Discrete Mathematics syllabus coverage/ })).toHaveAttribute("aria-valuenow", "31");
    expect(screen.getByText("No sessions logged yet")).toBeInTheDocument(); // empty state
  });

  it("shows an error state with retry when the API fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("x", { status: 500 })).mockResolvedValue(new Response(JSON.stringify(dashboard)));
    vi.stubGlobal("fetch", fetchMock);
    renderApp();
    expect(await screen.findByRole("alert")).toHaveTextContent("500");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Syllabus covered")).toBeInTheDocument();
  });
});

describe("role-aware navigation", () => {
  it("changes visible links and hides Log a session for students", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(dashboard))));
    renderApp();
    await screen.findByText("Syllabus covered");
    expect(screen.getAllByRole("link", { name: /Log a session/ }).length).toBeGreaterThan(0);
    await userEvent.selectOptions(screen.getByLabelText("Preview as role"), "student");
    await waitFor(() => expect(screen.queryByRole("link", { name: /Log a session/ })).not.toBeInTheDocument());
    const nav = within(screen.getAllByRole("navigation", { name: "Primary" })[0]!);
    expect(nav.queryByRole("link", { name: "Reports" })).not.toBeInTheDocument();
  });
});

describe("unbuilt sections", () => {
  it("say plainly that they are not available yet", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(dashboard))));
    localStorage.setItem("prospectus.role", "admin"); // Reports is hidden from other roles
    renderApp("/reports");
    expect(await screen.findByText("Not available yet")).toBeInTheDocument();
    expect(screen.getByText("Planned for Phase 4")).toBeInTheDocument();
  });
});
