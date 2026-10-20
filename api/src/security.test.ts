/**
 * Dedicated Security & Authorization Audit Test Suite (Phase 14).
 * Verifies authentication rejection, identity spoofing prevention, role escalation blocks,
 * object-level access boundaries, and production mode demo-header gating.
 */
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { Database } from "./db/client.js";

const noDb: Database = { prisma: null, check: async () => ({ state: "not_configured", detail: "x" }), close: async () => {} };

const createTestApp = (options: { nodeEnv?: "development" | "test" | "production"; allowDemo?: boolean } = {}) => {
  return createApp(
    {
      CORS_ORIGIN: "http://localhost:5173",
      NODE_ENV: options.nodeEnv ?? "test",
      ALLOW_DEMO_HEADERS: options.allowDemo,
    },
    noDb,
    () => new Date("2026-10-16T08:00:00Z"),
  );
};

const app = createTestApp();
const prodApp = createTestApp({ nodeEnv: "production", allowDemo: false });
const stagingApp = createTestApp({ nodeEnv: "production", allowDemo: true });

describe("Security Audit: Authentication & Demo Identity Verification", () => {
  const sampleSemester = {
    name: "Semester 3",
    academicYear: "2026-27",
    track: "MIRAI",
    campusId: "hi-tech",
    startsOn: "2026-08-03",
    endsOn: "2026-12-18",
  };

  it("rejects write requests with missing authentication header (401 unauthenticated)", async () => {
    const res = await request(app).post("/api/semesters").send(sampleSemester);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthenticated");
  });

  it("rejects write requests with invalid or spoofed role values (401 unauthenticated)", async () => {
    const spoofedRoles = ["root", "superuser", "admin' OR 1=1--", "manager", "SYSTEM", "", " "];
    for (const role of spoofedRoles) {
      const res = await request(app)
        .post("/api/semesters")
        .set("X-Demo-Role", role)
        .send(sampleSemester);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("unauthenticated");
    }
  });

  it("prevents privilege escalation: Student role cannot perform administrative mutations", async () => {
    const endpoints = [
      { method: "post", path: "/api/semesters", body: sampleSemester },
      { method: "post", path: "/api/exams", body: { name: "Exam", semesterId: "s1", type: "MID_TERM", startsOn: "2026-10-01", endsOn: "2026-10-02" } },
      { method: "post", path: "/api/batches", body: { name: "B1", semesterId: "s1" } },
      { method: "post", path: "/api/faculty", body: { name: "Faculty", campusId: "hi-tech" } },
      { method: "post", path: "/api/subjects", body: { code: "CS101", name: "Intro", batchId: "b1" } },
      { method: "post", path: "/api/timetable", body: { subjectId: "s1", weekday: 1, startTime: "09:00", endTime: "10:00" } },
      { method: "post", path: "/api/session-logs", body: {} },
    ];

    for (const { method, path, body } of endpoints) {
      const req = (request(app) as any)[method](path)
        .set("X-Demo-Role", "student")
        .send(body);
      const res = await req;
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("forbidden");
    }
  });

  it("prevents privilege escalation: Faculty role cannot mutate institution-wide semesters", async () => {
    const res = await request(app)
      .post("/api/semesters")
      .set("X-Demo-Role", "faculty")
      .send(sampleSemester);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("prevents privilege escalation: Campus Manager role cannot create or delete semesters", async () => {
    const createRes = await request(app)
      .post("/api/semesters")
      .set("X-Demo-Role", "campus_manager")
      .send(sampleSemester);
    expect(createRes.status).toBe(403);
    expect(createRes.body.error).toBe("forbidden");

    const deleteRes = await request(app)
      .delete("/api/semesters/sem1")
      .set("X-Demo-Role", "campus_manager");
    expect(deleteRes.status).toBe(403);
    expect(deleteRes.body.error).toBe("forbidden");
  });

  it("restricts reports access: Student role is strictly blocked from viewing academic reports", async () => {
    const res = await request(app)
      .get("/api/reports?type=course_progress&campusId=hi-tech")
      .set("X-Demo-Role", "student");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("enforces faculty identity scoping on reports: Faculty requires X-Demo-Faculty header", async () => {
    // Missing X-Demo-Faculty header
    const res = await request(app)
      .get("/api/reports?type=course_progress&campusId=hi-tech")
      .set("X-Demo-Role", "faculty");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("faculty_identity_required");
  });
});

describe("Security Audit: Production Environment Protection", () => {
  const sampleSemester = {
    name: "Semester 3",
    academicYear: "2026-27",
    track: "MIRAI",
    campusId: "hi-tech",
    startsOn: "2026-08-03",
    endsOn: "2026-12-18",
  };

  it("strictly disables demo headers in production mode when ALLOW_DEMO_HEADERS is false", async () => {
    // Attempting to send X-Demo-Role: admin against production configured app
    const res = await request(prodApp)
      .post("/api/semesters")
      .set("X-Demo-Role", "admin")
      .send(sampleSemester);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthenticated");
    expect(res.body.message).toMatch(/Demo authentication headers .* are disabled in production mode/);
  });

  it("allows demo headers in production only when ALLOW_DEMO_HEADERS is explicitly set to true (staging mode)", async () => {
    const res = await request(stagingApp)
      .post("/api/semesters")
      .set("X-Demo-Role", "admin")
      .send(sampleSemester);
    // Passes capability check (reaches 503 database_unavailable because noDb is attached)
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("database_unavailable");
  });

  it("in production only liveness is anonymous; metadata, academic data and every CSV export need a session", async () => {
    const health = await request(prodApp).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "degraded", service: "prospectus-api" }); // no database detail, uptime or version for anonymous callers
    expect((await request(prodApp).get("/api/meta")).status).toBe(401);
    for (const path of [
      "/api/dashboard?campusId=hi-tech", "/api/semesters?campusId=hi-tech", "/api/faculty?campusId=hi-tech", "/api/batches?campusId=hi-tech", "/api/subjects?campusId=hi-tech",
      "/api/subjects/export.csv?semesterId=x", "/api/timetable?semesterId=x", "/api/timetable/export.csv?semesterId=x", "/api/exams?semesterId=x", "/api/exams/export.csv?semesterId=x",
      "/api/calendar/month?campusId=hi-tech&track=MIRAI&month=2026-10", "/api/calendar/export.csv?campusId=hi-tech&track=MIRAI&year=2026", "/api/progression?campusId=hi-tech", "/api/progression/subjects/x",
      "/api/exam-readiness?campusId=hi-tech", "/api/session-logs/schedule?date=2026-10-19&campusId=hi-tech", "/api/session-logs/pending?campusId=hi-tech", "/api/subjects/x/syllabus", "/api/subjects/x/syllabus/export.csv",
    ]) {
      const res = await request(prodApp).get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error).toBe("unauthenticated");
      expect((await request(prodApp).get(path).set("X-Demo-Role", "admin")).status, `${path} must ignore demo headers`).toBe(401);
    }
  });

  it("development keeps reads open for the labelled demo picker", async () => {
    const dashboard = await request(createTestApp({ nodeEnv: "development" })).get("/api/dashboard?campusId=hi-tech");
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.dataSource).toBe("demo");
  });
});
