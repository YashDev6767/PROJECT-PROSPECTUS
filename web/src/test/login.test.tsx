import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { AppProvider } from "../context/AppContext";
import { ThemeProvider } from "../context/ThemeContext";
import type { Dashboard } from "../lib/types";

const campus = { id: "hi-tech", name: "HI-Tech" };
const dashboard: Dashboard = { dataSource: "demo", generatedAt: "2026-10-19T00:00:00Z", campuses: [campus], context: { campus, semester: "Sem 3", today: "2026-10-19" },
  metrics: { overallCoveragePct: 50, hoursBehind: 0, subjectsAtRisk: 0, nextExamInDays: null }, schedule: [], atRisk: [], exams: [], recentSessions: [] };

type Cfg = { sessionLogin: boolean; demoHeaders: boolean };
function server(cfg: Cfg, opts: { user?: object | null; loginStatus?: number; loginBody?: object } = {}) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url); calls.push({ url: u, method: init?.method ?? "GET", ...(init?.body ? { body: String(init.body) } : {}) });
    if (u.includes("/api/auth/config")) return new Response(JSON.stringify(cfg));
    if (u.includes("/api/auth/session")) return new Response(JSON.stringify({ user: opts.user ?? null }));
    if (u.includes("/api/auth/login")) return new Response(JSON.stringify(opts.loginBody ?? { user: { email: "admin@msot.test", role: "admin", name: "Test Admin", facultyId: null } }), { status: opts.loginStatus ?? 200 });
    if (u.includes("/api/auth/logout")) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(dashboard));
  }));
  return calls;
}
const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><ThemeProvider><AppProvider><App /><Routes><Route path="__never" element={null} /></Routes></AppProvider></ThemeProvider></MemoryRouter>);

beforeEach(() => { localStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe("access: login page and gate", () => {
  it("production-style server (demo headers off, sessions on): visiting the app redirects to /login", async () => {
    server({ sessionLogin: true, demoHeaders: false });
    renderAt("/subjects");
    expect(await screen.findByRole("heading", { level: 1, name: "Welcome back" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Preview as role")).not.toBeInTheDocument();
    expect(screen.queryByText(/continue with the role preview/)).not.toBeInTheDocument(); // no demo bypass offered
  });
  it("validates before sending anything, shows field errors, and toggles password visibility", async () => {
    const calls = server({ sessionLogin: true, demoHeaders: false });
    renderAt("/login");
    await screen.findByRole("heading", { name: "Welcome back" });
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your email")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/auth/login"))).toBe(false);
    const pw = screen.getByLabelText("Password");
    expect(pw).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(pw).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });
  it("shows the server's error for bad credentials, clears the password, and stays on the page", async () => {
    server({ sessionLogin: true, demoHeaders: false }, { loginStatus: 401, loginBody: { error: "invalid_credentials", message: "Email or password is incorrect." } });
    renderAt("/login");
    await userEvent.type(await screen.findByLabelText("Email"), "admin@msot.test");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });
  it("signs in, sends the credentials once to /api/auth/login, and lands in the app as that role (no role picker)", async () => {
    const calls = server({ sessionLogin: true, demoHeaders: false });
    renderAt("/login");
    await userEvent.type(await screen.findByLabelText("Email"), "admin@msot.test");
    await userEvent.type(screen.getByLabelText("Password"), "admin-passphrase-1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const nav = (await screen.findAllByRole("navigation", { name: "Primary" }))[0]!;
    expect(within(nav).getByRole("link", { name: "Overview" })).toBeInTheDocument();
    const login = calls.filter((c) => c.url.includes("/auth/login"));
    expect(login).toHaveLength(1);
    expect(JSON.parse(login[0]!.body!)).toEqual({ email: "admin@msot.test", password: "admin-passphrase-1" });
    expect(screen.getAllByText(/Test Admin/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Preview as role")).not.toBeInTheDocument();
    // a signed-in browser must not send spoofable demo headers
    const later = (fetch as unknown as { mock: { calls: Array<[string, RequestInit?]> } }).mock.calls.filter(([u]) => String(u).includes("/api/dashboard")).pop()!;
    expect(JSON.stringify(later[1]?.headers ?? {})).not.toMatch(/X-Demo/i);
  });
  it("an existing session skips the login page; signing out returns to it", async () => {
    server({ sessionLogin: true, demoHeaders: false }, { user: { email: "fac@msot.test", role: "faculty", name: null, facultyId: "fac-1" } });
    renderAt("/login");
    await screen.findAllByRole("navigation", { name: "Primary" });
    await userEvent.click(screen.getByRole("button", { name: /Sign out/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Welcome back" })).toBeInTheDocument();
  });
  it("without server-side accounts the page is still fully visible, says so, and the server's refusal is shown on submit", async () => {
    server({ sessionLogin: false, demoHeaders: false });
    const calls = server({ sessionLogin: false, demoHeaders: false }, { loginStatus: 503, loginBody: { error: "login_not_configured", message: "Sign-in is not configured on this server." } });
    renderAt("/login");
    expect(await screen.findByRole("status")).toHaveTextContent(/Sign-in is not configured on this server/);
    expect(screen.getByLabelText("Email")).toBeEnabled();
    expect(screen.getByLabelText("Password")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Show password" })).toBeEnabled();
    await userEvent.type(screen.getByLabelText("Email"), "someone@msot.test");
    await userEvent.type(screen.getByLabelText("Password"), "whatever-pass");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not configured on this server/);
    expect(calls.some((c) => c.url.includes("/auth/login"))).toBe(true);
  });
  it("demo mode always offers a visible way to the sign-in page, even before accounts are configured", async () => {
    server({ sessionLogin: false, demoHeaders: true });
    renderAt("/");
    const link = await screen.findByRole("link", { name: "Open the sign-in page" });
    expect(link).toHaveAttribute("href", "/login");
  });
  it("local development keeps the labelled demo role preview (and links to it from the login page)", async () => {
    server({ sessionLogin: true, demoHeaders: true });
    renderAt("/");
    expect(await screen.findByLabelText("Preview as role")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in with an account" })).toBeInTheDocument();
  });
  it("an older or unreachable auth API behaves like plain demo mode", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("/api/auth") ? new Response("x", { status: 404 }) : new Response(JSON.stringify(dashboard)))));
    renderAt("/");
    await waitFor(() => expect(screen.getByLabelText("Preview as role")).toBeInTheDocument());
  });
});
