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
    let dashboardCalls = 0; // only the dashboard request fails the first time (the auth probes are separate requests)
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("/api/dashboard") && dashboardCalls++ === 0 ? new Response("x", { status: 500 }) : new Response(JSON.stringify(String(url).includes("/api/auth") ? {} : dashboard)))));
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

describe("reports section", () => {
  it("renders reports for admin role", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/dashboard")) return new Response(JSON.stringify(dashboard));
      if (u.includes("/api/meta")) return new Response(JSON.stringify({ campuses: [campus] }));
      if (u.includes("/api/faculty")) return new Response(JSON.stringify({ faculty: [] }));
      return new Response(JSON.stringify({
        reportType: "course_progress",
        summary: { totalSubjects: 0, healthySubjects: 0, attentionSubjects: 0, criticalSubjects: 0, totalPlannedHours: 0, totalCoveredHours: 0, averageCoveragePct: 0 },
        data: [],
        campuses: [campus],
      }));
    }));
    localStorage.setItem("prospectus.role", "admin");
    renderApp("/reports");
    expect(await screen.findByRole("heading", { name: "Reports" })).toBeInTheDocument();
  });

  it("blocks students from accessing reports via AccessGate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(dashboard))));
    localStorage.setItem("prospectus.role", "student");
    renderApp("/reports");
    expect(await screen.findByText("Reports isn't available to the Student role")).toBeInTheDocument();
  });
});
