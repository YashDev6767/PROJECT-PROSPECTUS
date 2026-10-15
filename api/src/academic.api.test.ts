/** Phase 2 API behaviour that does not need a database: permissions, validation and honest 503s. */
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { Database } from "./db/client.js";

const noDb: Database = { prisma: null, check: async () => ({ state: "not_configured", detail: "x" }), close: async () => {} };
const app = createApp({ CORS_ORIGIN: "http://localhost:5173" }, noDb, () => new Date("2026-10-16T08:00:00Z"));
const as = (role: string | null) => (t: request.Test) => (role ? t.set("X-Demo-Role", role) : t);

const semester = { name: "Semester 3", academicYear: "2026-27", track: "MIRAI", campusId: "hi-tech", startsOn: "2026-08-03", endsOn: "2026-12-18" };

describe("permission boundaries (demo header, not real auth)", () => {
  it("rejects writes with no role (401), the wrong role (403), and allows the right one through to validation", async () => {
    expect((await request(app).post("/api/semesters").send(semester)).status).toBe(401);
    expect((await as("faculty")(request(app).post("/api/semesters")).send(semester)).status).toBe(403);
    expect((await as("campus_manager")(request(app).post("/api/semesters")).send(semester)).status).toBe(403); // semesters are admin-only
    expect((await as("root")(request(app).post("/api/semesters")).send(semester)).status).toBe(401); // unknown role value
  });

  it("lets campus managers write academic data but not students or faculty", async () => {
    const body = { name: "", semesterId: "x", type: "MID_TERM", startsOn: "2026-10-01", endsOn: "2026-10-02" };
    expect((await as("student")(request(app).post("/api/exams")).send(body)).status).toBe(403);
    expect((await as("faculty")(request(app).post("/api/batches")).send({})).status).toBe(403);
    expect((await as("campus_manager")(request(app).post("/api/exams")).send(body)).status).toBe(400); // got past auth, failed validation
  });

  it("keeps reads open (they are not role-gated)", async () => {
    expect((await request(app).get("/api/meta")).status).toBe(200);
  });
});

describe("request validation returns field-level issues", () => {
  it("semester: end before start and a non-consecutive academic year", async () => {
    const res = await as("admin")(request(app).post("/api/semesters")).send({ ...semester, startsOn: "2026-12-18", endsOn: "2026-08-03", academicYear: "2026-29" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_failed");
    const paths = res.body.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(["academicYear", "endsOn"]));
  });

  it("semester: unknown campus, track and impossible date", async () => {
    const res = await as("admin")(request(app).post("/api/semesters")).send({ ...semester, campusId: "mars", track: "X", startsOn: "2026-02-31" });
    expect(res.body.issues.map((i: { path: string }) => i.path).sort()).toEqual(["campusId", "startsOn", "track"]);
  });

  it("calendar entry: missing title, then a reversed range", async () => {
    const missing = await as("admin")(request(app).post("/api/calendar/entries")).send({ title: " ", category: "HOLIDAY", startsOn: "2026-10-05" });
    expect(missing.body.issues.map((i: { path: string }) => i.path)).toEqual(["title"]);
    const reversed = await as("admin")(request(app).post("/api/calendar/entries")).send({ title: "Break", category: "HOLIDAY", startsOn: "2026-10-05", endsOn: "2026-10-01" });
    expect(reversed.status).toBe(400);
    expect(reversed.body.issues[0]).toMatchObject({ path: "endsOn", message: expect.stringMatching(/before the start/) });
  });

  it("special working days need the dedicated permission even through the generic endpoint", async () => {
    const body = { title: "Make-up day", category: "SPECIAL_WORKING_DAY", startsOn: "2026-11-01" };
    expect((await as("faculty")(request(app).post("/api/calendar/entries")).send(body)).status).toBe(403);
    expect((await as("campus_manager")(request(app).post("/api/calendar/entries")).send(body)).status).toBe(503); // allowed; stopped only because there is no database
  });

  it("timetable: bad times and weekdays are rejected before any lookup", async () => {
    const send = (b: object) => as("admin")(request(app).post("/api/timetable")).send({ subjectId: "s", weekday: 1, startTime: "09:00", endTime: "10:00", ...b });
    expect((await send({ startTime: "11:00", endTime: "10:00" })).body.issues[0].message).toMatch(/after the start/);
    expect((await send({ startTime: "9am" })).status).toBe(400);
    expect((await send({ weekday: 7 })).status).toBe(400);
    expect((await send({ weekday: 0 })).status).toBe(400);
  });

  it("syllabus: duplicate topics and non-positive hours are rejected", async () => {
    const res = await as("admin")(request(app).put("/api/subjects/abc/syllabus")).send({ units: [{ title: "U", topics: [{ title: "T", plannedHours: 1 }, { title: "t", plannedHours: 0 }] }] });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: { message: string }) => i.message)).toEqual(expect.arrayContaining([expect.stringMatching(/Duplicate topic/), expect.stringMatching(/planned hours/)]));
  });

  it("subject, faculty and batch bodies are validated", async () => {
    expect((await as("admin")(request(app).post("/api/subjects")).send({ code: "", name: "x", batchId: "b", plannedHours: -2 })).status).toBe(400);
    expect((await as("admin")(request(app).post("/api/faculty")).send({ name: "A", campusId: "hi-tech", email: "nope" })).body.issues[0].path).toBe("email");
    expect((await as("admin")(request(app).post("/api/batches")).send({ name: "A", semesterId: "s", studentCount: 1.5 })).status).toBe(400);
  });

  it("malformed JSON returns 400 JSON, not a stack trace", async () => {
    const res = await as("admin")(request(app).post("/api/semesters")).set("Content-Type", "application/json").send("{oops");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_json");
  });
});

describe("no database configured", () => {
  it("answers 503 database_unavailable for data endpoints instead of fake data", async () => {
    for (const path of ["/api/semesters", "/api/exams", "/api/batches", "/api/faculty", "/api/subjects", "/api/timetable", "/api/calendar/month?campusId=hi-tech&track=MIRAI&month=2026-10"]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(503);
      expect(res.body.error).toBe("database_unavailable");
    }
  });
  it("still validates query parameters first", async () => {
    expect((await request(app).get("/api/calendar/month?campusId=hi-tech&track=MIRAI&month=2026-13")).status).toBe(400);
  });
  it("keeps Phase 1 endpoints working", async () => {
    expect((await request(app).get("/api/health")).body.status).toBe("degraded");
    expect((await request(app).get("/api/dashboard")).body.dataSource).toBe("demo");
  });
});

describe("Phase 3 endpoints without a database", () => {
  const body = { subjectId: "s", heldOn: "2026-10-05", timetableEntryId: "e", outcome: "COMPLETED", covered: [{ topicId: "t", completionPct: 50 }] };
  it("session-log writes need an allowed demo role", async () => {
    expect((await request(app).post("/api/session-logs").send(body)).status).toBe(401);
    expect((await as("student")(request(app).post("/api/session-logs")).send(body)).status).toBe(403);
    expect((await as("student")(request(app).get("/api/session-logs"))).status).toBe(403);
    expect((await as("faculty")(request(app).post("/api/session-logs/x/review")).send({})).status).toBe(403); // review is for managers/admins
  });
  it("validates the request shape before touching the database", async () => {
    const res = await as("faculty")(request(app).post("/api/session-logs")).send({ ...body, outcome: "DONE", heldOn: "2026-02-30" });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: { path: string }) => i.path).sort()).toEqual(["heldOn", "outcome"]);
    expect((await as("faculty")(request(app).patch("/api/session-logs/x")).send({ notes: "no correction note" })).body.issues[0].path).toBe("correctionNote");
    expect((await request(app).get("/api/session-logs/schedule?date=nope&campusId=hi-tech")).status).toBe(400);
    expect((await request(app).get("/api/session-logs/pending?campusId=hi-tech&days=99")).status).toBe(400);
    expect((await request(app).get("/api/progression?campusId=mars")).status).toBe(400);
  });
  it("answers 503 instead of fake progression when there is no database", async () => {
    for (const path of ["/api/progression?campusId=hi-tech", "/api/progression/subjects/x", "/api/session-logs/schedule?date=2026-10-05&campusId=hi-tech", "/api/session-logs/pending?campusId=hi-tech"]) {
      expect((await request(app).get(path)).status, path).toBe(503);
    }
  });
  it("keeps serving the labelled demo dashboard", async () => {
    const res = await request(app).get("/api/dashboard?campusId=juj");
    expect(res.body.dataSource).toBe("demo");
    expect(res.body.schedule[0]).toHaveProperty("state");
  });
});

describe("configuration", () => {
  it("accepts defaults and rejects impossible thresholds or time zones", async () => {
    const { loadEnv } = await import("./config/env.js");
    expect(loadEnv({} as NodeJS.ProcessEnv)).toMatchObject({ APP_TIME_ZONE: "Asia/Kolkata", RISK_ON_TRACK_BUFFER: 1.15, RISK_TIGHT_BUFFER: 1, SYLLABUS_DEADLINE_EXAM_TYPE: "END_TERM" });
    expect(() => loadEnv({ RISK_ON_TRACK_BUFFER: "1.1", RISK_TIGHT_BUFFER: "1.2" } as unknown as NodeJS.ProcessEnv)).toThrow(/RISK_TIGHT_BUFFER/);
    expect(() => loadEnv({ APP_TIME_ZONE: "Mars/Olympus" } as unknown as NodeJS.ProcessEnv)).toThrow(/time zone/);
    expect(loadEnv({ RISK_ON_TRACK_BUFFER: "1.3", RISK_TIGHT_BUFFER: "1.1" } as unknown as NodeJS.ProcessEnv)).toMatchObject({ RISK_ON_TRACK_BUFFER: 1.3, RISK_TIGHT_BUFFER: 1.1 });
  });
});
