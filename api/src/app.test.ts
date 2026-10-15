import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { Database, DatabaseStatus } from "./db/client.js";

const fakeDb = (status: DatabaseStatus): Database => ({ prisma: null, check: async () => status, close: async () => {} });
const fixedNow = () => new Date("2026-10-16T08:00:00Z");
const app = (status: DatabaseStatus = { state: "not_configured", detail: "DATABASE_URL is not set" }) =>
  createApp({ CORS_ORIGIN: "http://localhost:5173" }, fakeDb(status), fixedNow);

describe("GET /api/health", () => {
  it("reports degraded, not ok, when no database is configured", async () => {
    const res = await request(app()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("degraded");
    expect(res.body.database.state).toBe("not_configured");
  });

  it("reports ok when the database responds", async () => {
    const res = await request(app({ state: "connected", latencyMs: 3 })).get("/api/health");
    expect(res.body.status).toBe("ok");
  });
});

describe("GET /api/dashboard", () => {
  it("labels the payload as demo data and computes risk from the domain layer", async () => {
    const res = await request(app()).get("/api/dashboard?campusId=hi-tech");
    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe("demo");
    expect(res.body.context.campus.id).toBe("hi-tech");
    const discrete = res.body.atRisk.find((s: { code: string }) => s.code === "MA210");
    expect(discrete.risk).toBe("critical");
    expect(res.body.metrics.nextExamInDays).toBe(17);
    expect(res.body.exams[0].examDate).toBe("2026-11-02");
  });

  it("defaults to the first campus", async () => {
    const res = await request(app()).get("/api/dashboard");
    expect(res.body.context.campus.id).toBe("hi-tech");
  });

  it("returns 404 for an unknown campus and 400 for an invalid query", async () => {
    expect((await request(app()).get("/api/dashboard?campusId=nope")).status).toBe(404);
    expect((await request(app()).get(`/api/dashboard?campusId=${"x".repeat(100)}`)).status).toBe(400);
  });
});

describe("unknown routes", () => {
  it("return JSON 404", async () => {
    const res = await request(app()).get("/api/nothing");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });
});
