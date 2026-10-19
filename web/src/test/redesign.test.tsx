import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { SubjectRiskCard } from "../components/SubjectRiskCard";
import { AppProvider } from "../context/AppContext";
import { ThemeProvider } from "../context/ThemeContext";
import type { Dashboard, SubjectRow } from "../lib/types";

const campus = { id: "hi-tech", name: "HI-Tech" };
const row = (over: Partial<SubjectRow> = {}): SubjectRow => ({
  id: "s1", code: "SMP103", name: "Database Concepts", faculty: "Sample Faculty HITECH-3", batchName: "Mirai Batch A", track: "Mirai",
  coveragePct: 44.42, expectedPct: 83.3, hoursBehind: 14, risk: "critical", daysToExam: 52, status: "DANGER", bufferRatio: 0.55,
  remainingHours: 20.01, availableHours: 11, deadline: "2026-12-07", reason: "Not enough time: only 11 h of teaching left for 20.01 h of syllabus (buffer 0.55, below 1.00).", ...over,
});
const rows: SubjectRow[] = [
  ...[1, 2, 3, 4, 5].map((n) => row({ id: `d${n}`, name: `Danger subject ${n}` })),
  ...[1, 2, 3].map((n) => row({ id: `t${n}`, name: `Tight subject ${n}`, risk: "at_risk", status: "TIGHT", bufferRatio: 1.02 })),
];
const dashboard: Dashboard = {
  dataSource: "live", generatedAt: "2026-10-16T00:00:00Z", campuses: [campus], context: { campus, semester: "Semester 3", today: "2026-10-16" },
  overall: { status: "DANGER", worstSubject: { id: "d1", name: "Danger subject 1", batchName: "Mirai Batch A" }, byTrack: [] },
  metrics: { overallCoveragePct: 50, hoursBehind: 10, subjectsAtRisk: 8, nextExamInDays: 5 }, schedule: [], atRisk: rows, exams: [], recentSessions: [],
};

beforeEach(() => { localStorage.clear(); localStorage.setItem("prospectus.role", "admin"); });
afterEach(() => vi.unstubAllGlobals());
const renderApp = (path = "/") => {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => (String(input).includes("/api/dashboard") ? new Response(JSON.stringify(dashboard)) : new Response("{}", { status: 404 }))));
  return render(<MemoryRouter initialEntries={[path]}><ThemeProvider><AppProvider><App /></AppProvider></ThemeProvider></MemoryRouter>);
};

describe("Subjects at risk", () => {
  it("shows distinct, derived counts and lets the filter narrow the list without changing the counts", async () => {
    renderApp();
    const section = await screen.findByRole("region", { name: "Subjects at risk" });
    const summary = within(section).getByLabelText("Summary");
    expect(within(summary).getByText("5 Danger")).toBeInTheDocument();
    expect(within(summary).getByText("3 Tight")).toBeInTheDocument();
    expect(within(section).getAllByRole("article")).toHaveLength(8);
    await userEvent.click(within(section).getByRole("tab", { name: "Tight (3)" }));
    expect(within(section).getAllByRole("article")).toHaveLength(3);
    expect(within(summary).getByText("5 Danger")).toBeInTheDocument(); // summary reflects the data, not the filter
    await userEvent.click(within(section).getByRole("tab", { name: "Danger (5)" }));
    expect(within(section).getAllByRole("article")).toHaveLength(5);
  });
});

describe("SubjectRiskCard", () => {
  const view = (r: SubjectRow, live = true) => render(<MemoryRouter><ThemeProvider><SubjectRiskCard row={r} live={live} /></ThemeProvider></MemoryRouter>);

  it("separates identity, status, the four numbers and one plain sentence", () => {
    view(row());
    const card = screen.getByRole("article");
    expect(within(card).getByRole("heading", { name: "Database Concepts" })).toBeInTheDocument();
    expect(within(card).getByText("Danger")).toBeInTheDocument();
    expect(within(card).getByText("SMP103 · Mirai Batch A · Mirai · Sample Faculty HITECH-3")).toBeInTheDocument();
    const metrics = within(card).getByText("Coverage").closest("dl")!;
    expect(within(metrics).getByText("44.42%")).toBeInTheDocument();
    expect(within(metrics).getByText("83.3%")).toBeInTheDocument();
    expect(within(metrics).getByText("14 h")).toBeInTheDocument();
    expect(within(metrics).getByText("Buffer ratio").nextElementSibling).toHaveTextContent("0.55");
    expect(within(card).getByText("11 h of teaching remain for 20.01 h of syllabus, before 7 Dec.")).toBeInTheDocument();
  });

  it("links to the subject and keeps the long explanation behind a disclosure", async () => {
    view(row());
    expect(screen.getByRole("link", { name: "Database Concepts" })).toHaveAttribute("href", "/subjects/s1");
    const toggle = screen.getByRole("button", { name: "Why this status" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("copes with long names, missing faculty and demo rows that have no buffer or link", () => {
    view(row({ id: "x", name: "An extremely long subject name that should wrap across lines instead of overflowing its card ".repeat(2), faculty: "", bufferRatio: null, status: undefined, reason: undefined, availableHours: undefined, remainingHours: undefined }), false);
    const card = screen.getByRole("article");
    expect(within(card).queryByRole("link")).not.toBeInTheDocument();
    expect(within(card).getByText("—")).toBeInTheDocument(); // no buffer ratio for demo data
    expect(within(card).getByText("Critical")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Why this status" })).not.toBeInTheDocument();
  });
});

describe("sidebar", () => {
  it("groups the destinations, keeps every link, and shows Settings and the demo role at the bottom", async () => {
    renderApp();
    const nav = (await screen.findAllByRole("navigation", { name: "Primary" }))[0]!;
    for (const g of ["Workspace", "Academics", "Teaching", "Reports and settings"]) expect(within(nav).getByRole("group", { name: g })).toBeInTheDocument();
    for (const l of ["Overview", "Academic Calendar", "Semesters", "Exam Schedule", "Subjects", "Timetable", "Session Logs", "Exam Readiness", "Reports", "Settings"]) expect(within(nav).getByRole("link", { name: l })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByLabelText("Preview as role")).toHaveLength(1);
  });

  it("collapses to an icon rail that keeps accessible names, and remembers the choice", async () => {
    const view = renderApp();
    const nav = (await screen.findAllByRole("navigation", { name: "Primary" }))[0]!;
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
    expect(localStorage.getItem("prospectus.sidebar")).toBe("collapsed");
    const subjects = within(nav).getByRole("link", { name: "Subjects" }); // icon-only now: the accessible name comes from aria-label
    expect(screen.queryByRole("tooltip")).toBeNull();
    await userEvent.hover(subjects); // visual tooltip (aria-hidden duplicate of the name) appears on hover …
    expect(document.body.textContent).toContain("Subjects");
    await userEvent.unhover(subjects);
    subjects.focus(); // … and on keyboard focus, and Escape dismisses it
    await userEvent.keyboard("{Escape}");
    view.unmount();
    renderApp();
    expect(await screen.findByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });

  it("hides sections the previewed role cannot use", async () => {
    localStorage.setItem("prospectus.role", "student");
    renderApp();
    const nav = (await screen.findAllByRole("navigation", { name: "Primary" }))[0]!;
    expect(within(nav).queryByRole("link", { name: "Reports" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("group", { name: "Reports and settings" })).not.toBeInTheDocument(); // students see neither Reports nor Settings
  });
});

describe("motion and performance rules (index.css)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
  const rule = (sel: string) => new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? "";
  it("defines duration and easing tokens and uses them for the page entrance", () => {
    expect(css).toMatch(/--dur-fast:\s*120ms/); expect(css).toMatch(/--dur-base:\s*180ms/); expect(css).toMatch(/--ease-out:/);
    expect(rule(".page-enter")).toContain("var(--dur-base)");
  });
  it("has no per-card entrance animation, no global smooth scrolling and no blur on cards or chrome", () => {
    expect(rule(".stagger > *")).toContain("animation: none");
    expect(css).not.toMatch(/html\s*\{[^}]*scroll-behavior:\s*smooth/);
    expect(rule(".surface")).not.toContain("backdrop-filter");
    expect(rule(".glass")).not.toContain("backdrop-filter");
  });
  it("collapses every animation under prefers-reduced-motion", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain("animation-duration: 0.01ms"); expect(block).toContain("transition-duration: 0.01ms"); expect(block).toContain("scroll-behavior: auto");
  });
});

describe("brand and background", () => {
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
  const hex = (name: string) => { const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css); return m ? m[1]! : null; };
  const channels = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

  it("the brand accent and logo colours are indigo/violet, never green (status colours keep their own tokens)", () => {
    for (const token of ["accent", "accent-solid", "accent-text", "brand-a", "brand-b"]) {
      const [r, g, b] = channels(hex(token)!);
      expect(b, `--${token}`).toBeGreaterThan(g);
      expect(b, `--${token}`).toBeGreaterThanOrEqual(r);
    }
    const ok = channels(hex("ok")!);
    expect(ok[1]).toBeGreaterThan(ok[2]); // success stays green
  });

  it("paints an ambient background layer behind the app, with the vendored Spotlight and Dot Pattern", async () => {
    const { container } = renderApp();
    await screen.findByRole("region", { name: "Subjects at risk" });
    const bg = container.querySelector(".app-bg");
    expect(bg).not.toBeNull();
    expect(bg).toHaveAttribute("aria-hidden", "true");
    expect(bg!.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2); // Aceternity Spotlight + Magic UI Dot Pattern
    expect(css).toMatch(/\.app-bg\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*-10/);
  });

  it("the wordmark is rendered in the neutral foreground colour", async () => {
    renderApp();
    const word = (await screen.findAllByText("PROSPECTUS"))[0]!;
    expect(word.className).toContain("text-fg");
    expect(word.className).not.toMatch(/accent|green|emerald/);
  });
});
