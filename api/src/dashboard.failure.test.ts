import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { Database } from "./db/client.js";

const now = () => new Date("2026-10-16T08:00:00Z");
const app = (db: Database) => createApp({ CORS_ORIGIN: "http://localhost:5173" }, db, now);
const connected = (prisma: unknown): Database => ({ prisma: prisma as Database["prisma"], check: async () => ({ state: "connected", latencyMs: 1 }), close: async () => {} });
const broken = () => connected({ semester: { count: async () => { throw new Error("connection reset") } } });

describe("dashboard when the live computation fails", () => {
  it("answers 503 with an explicit message; it never substitutes demo numbers", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app(broken())).get("/api/dashboard?campusId=hi-tech");
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("dashboard_unavailable");
    expect(res.body.message).toMatch(/not an all-clear/);
    expect(res.body.dataSource).toBeUndefined();
    expect(res.body.atRisk).toBeUndefined();
    expect(res.body).not.toHaveProperty("metrics");
    expect(JSON.stringify(res.body)).not.toMatch(/connection reset/); // internals are logged, not leaked
    spy.mockRestore();
  });
  it("with no database configured at all, the labelled demo dataset is still served", async () => {
    const res = await request(app({ prisma: null, check: async () => ({ state: "not_configured", detail: "x" }), close: async () => {} })).get("/api/dashboard?campusId=hi-tech");
    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe("demo");
    expect(res.body.state).toBeUndefined();
  });
  it("exam readiness has no demo fallback: no database is a 503, a failing query is a 500", async () => {
    const none = await request(app({ prisma: null, check: async () => ({ state: "not_configured", detail: "x" }), close: async () => {} })).get("/api/exam-readiness?campusId=hi-tech");
    expect(none.status).toBe(503);
    expect(none.body.error).toBe("database_unavailable");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = await request(app(connected({ semester: { findMany: async () => { throw new Error("boom") } } }))).get("/api/exam-readiness?campusId=hi-tech");
    expect(failing.status).toBe(500);
    expect(failing.body.error).toBe("internal_error");
    spy.mockRestore();
  });
});
