/**
 * Integration (real PostgreSQL): the student learning portal and its data boundaries.
 * Hand-calculated scenario (today = Mon 5 Oct 2026, semester 7 Sep – 18 Dec, no Saturdays):
 *   Batch A (RGIB): SA1 Mon 1 h, topics TA1 4 h (tagged Mid-term) + TA2 2 h (tagged End-term); TA1 logged 100 %  -> coverage 4/6 = 66.67 %
 *                   SA2 no timetable, one 6 h topic, nothing covered                                           -> 0 %, no teaching time -> needs attention
 *                   overall = (4 + 0) / (6 + 6) = 33.3 %, one subject needing attention
 *   Batch A2 (RGIB, same semester) has its own exam; Batch Z (JUJ) is another campus entirely.
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDatabase, type Database } from "./db/client.js";
import { hashPassword } from "./services/auth.js";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("student portal: scoping, read-only and correctness (PostgreSQL)", () => {
  let db: Database;
  let dev: ReturnType<typeof createApp>;
  let prod: ReturnType<typeof createApp>;
  const clock = new Date("2026-10-05T08:00:00Z");
  const ids: Record<string, string> = {};
  const admin = (t: request.Test) => t.set("X-Demo-Role", "admin");
  const cookie = async (email: string, password: string) => String((await request(prod).post("/api/auth/login").send({ email, password })).headers["set-cookie"]?.[0]).split(";")[0]!;
  const portal = (c: string, qs = "") => request(prod).get(`/api/student/portal${qs}`).set("Cookie", c);
  let a: string, z: string, none: string, fac: string, adm: string;

  beforeAll(async () => {
    execSync("npx prisma migrate deploy", { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    db = createDatabase(url);
    await db.prisma!.$executeRawUnsafe(`TRUNCATE "SessionTopicEntry","SessionLogRevision","SessionLog","Exam","CalendarEntry","TimetableEntry","SyllabusTopic","SyllabusUnit","Subject","Batch","Faculty","Semester" RESTART IDENTITY CASCADE`);
    dev = createApp({ CORS_ORIGIN: "http://localhost:5173" }, db, () => clock);
    const post = async (path: string, body: object) => (await admin(request(dev).post(path)).send(body)).body;
    const sem = async (campusId: string, name: string) => { const s = await post("/api/semesters", { name, academicYear: "2026-27", track: "MIRAI", campusId, startsOn: "2026-09-07", endsOn: "2026-12-18", saturdayRule: "NONE" }); await admin(request(dev).post(`/api/semesters/${s.id}/activate`)).send({}); return s.id as string; };
    ids.semA = await sem("rgib", "Sem A"); ids.semZ = await sem("juj", "Sem Z");
    ids.bA = (await post("/api/batches", { name: "Batch A", semesterId: ids.semA })).id;
    ids.bA2 = (await post("/api/batches", { name: "Batch A2", semesterId: ids.semA })).id;
    ids.bZ = (await post("/api/batches", { name: "Batch Z", semesterId: ids.semZ })).id;
    ids.fac = (await post("/api/faculty", { name: "Secret Faculty Name", campusId: "rgib" })).id;
    ids.sa1 = (await post("/api/subjects", { code: "SA1", name: "Alpha One", batchId: ids.bA, facultyId: ids.fac })).id;
    ids.sa2 = (await post("/api/subjects", { code: "SA2", name: "Alpha Two", batchId: ids.bA })).id;
    ids.sz1 = (await post("/api/subjects", { code: "SZ1", name: "Zulu Private", batchId: ids.bZ })).id;
    const syl = await admin(request(dev).put(`/api/subjects/${ids.sa1}/syllabus`)).send({ units: [{ title: "Unit A", topics: [{ title: "TA1", plannedHours: 4, examScope: "MID_TERM" }, { title: "TA2", plannedHours: 2, examScope: "END_TERM" }] }] });
    ids.ta1 = syl.body.units[0].topics[0].id;
    await admin(request(dev).put(`/api/subjects/${ids.sa2}/syllabus`)).send({ units: [{ title: "Unit B", topics: [{ title: "TB1", plannedHours: 6 }] }] });
    await admin(request(dev).put(`/api/subjects/${ids.sz1}/syllabus`)).send({ units: [{ title: "Unit Z", topics: [{ title: "TZ1 secret topic", plannedHours: 3 }] }] });
    ids.mon = (await post("/api/timetable", { subjectId: ids.sa1, weekday: 1, startTime: "09:00", endTime: "10:00" })).id;
    await post("/api/timetable", { subjectId: ids.sz1, weekday: 2, startTime: "10:00", endTime: "11:00" });
    await post("/api/exams", { name: "Mid-term", type: "MID_TERM", semesterId: ids.semA, startsOn: "2026-10-26", endsOn: "2026-10-30" });
    await post("/api/exams", { name: "A2 only quiz", type: "SESSIONAL", semesterId: ids.semA, batchId: ids.bA2, startsOn: "2026-11-16", endsOn: "2026-11-17" });
    await post("/api/exams", { name: "Zulu End-term", type: "END_TERM", semesterId: ids.semZ, startsOn: "2026-11-30", endsOn: "2026-12-04" });
    expect((await admin(request(dev).post("/api/session-logs")).send({ subjectId: ids.sa1, heldOn: "2026-09-07", timetableEntryId: ids.mon, outcome: "COMPLETED", covered: [{ topicId: ids.ta1, completionPct: 100 }] })).status).toBe(201);

    const users = JSON.stringify([
      { email: "a@t.test", role: "student", batchId: ids.bA, passwordHash: hashPassword("student-a-passphrase") },
      { email: "z@t.test", role: "student", batchId: ids.bZ, passwordHash: hashPassword("student-z-passphrase") },
      { email: "none@t.test", role: "student", passwordHash: hashPassword("student-none-passphrase") },
      { email: "fac@t.test", role: "faculty", facultyId: ids.fac, passwordHash: hashPassword("faculty-passphrase-1") },
      { email: "adm@t.test", role: "admin", passwordHash: hashPassword("admin-passphrase-1") },
    ]);
    prod = createApp({ CORS_ORIGIN: "http://localhost:5173", NODE_ENV: "production", ALLOW_DEMO_HEADERS: false, AUTH_USERS: users, SESSION_SECRET: "s".repeat(40) } as never, db, () => clock);
    [a, z, none, fac, adm] = await Promise.all([cookie("a@t.test", "student-a-passphrase"), cookie("z@t.test", "student-z-passphrase"), cookie("none@t.test", "student-none-passphrase"), cookie("fac@t.test", "faculty-passphrase-1"), cookie("adm@t.test", "admin-passphrase-1")]);
  });
  afterAll(async () => { await db?.close(); });

  it("shows the student's own batch with hour-weighted progress (hand-calculated)", async () => {
    const res = await portal(a);
    expect(res.status).toBe(200);
    expect(res.body.batch).toEqual({ id: ids.bA, name: "Batch A" });
    expect(res.body).toMatchObject({ campusId: "rgib", track: "MIRAI", semester: { name: "Sem A" } });
    expect(res.body.overview).toMatchObject({ subjectCount: 2, overallCoveragePct: 33.3, coveredHours: 4, hoursInScope: 12, needAttention: 1 });
    const alpha = res.body.subjects.find((s: { code: string }) => s.code === "SA1");
    expect(alpha).toMatchObject({ name: "Alpha One", coveragePct: 66.67, coveredHours: 4, remainingHours: 2, hoursInScope: 6, status: { key: "on_track", label: "On track" } });
    expect(alpha.coveredTopics).toEqual([{ title: "TA1", unitTitle: "Unit A", completionPct: 100 }]);
    expect(alpha.upcomingTopics.map((t: { title: string }) => t.title)).toEqual(["TA2"]);
    const beta = res.body.subjects.find((s: { code: string }) => s.code === "SA2");
    expect(beta).toMatchObject({ coveragePct: 0, remainingHours: 6, status: { key: "needs_attention", label: "Needs attention" } });
  });

  it("lists the next planned classes (from the timetable) and only exams that apply to this batch, with their scope", async () => {
    const res = await portal(a);
    expect(res.body.upcomingClasses[0]).toMatchObject({ date: "2026-10-05", startTime: "09:00", endTime: "10:00", subjectName: "Alpha One" });
    expect(res.body.upcomingClasses.every((c: { subjectName: string }) => c.subjectName === "Alpha One")).toBe(true);
    expect(res.body.exams.map((e: { name: string }) => e.name)).toEqual(["Mid-term"]); // not "A2 only quiz" (another batch), not Zulu's (another campus)
    const mid = res.body.exams[0];
    expect(mid).toMatchObject({ typeLabel: "Mid-term", startsOn: "2026-10-26", daysToStart: 21, phase: "upcoming" });
    const alpha = mid.subjects.find((s: { code: string }) => s.code === "SA1");
    expect(alpha.scope).toMatch(/assessed in this exam/);
    expect(alpha.scopeTopics).toEqual([{ title: "TA1", unitTitle: "Unit A", completionPct: 100 }]); // TA2 is tagged End-term: not in scope
    expect(alpha).toMatchObject({ coveragePct: 100, remainingHours: 0, status: { key: "complete" } });
    const beta = mid.subjects.find((s: { code: string }) => s.code === "SA2");
    expect(beta.scope).toMatch(/whole syllabus/i);
  });

  it("never exposes another batch or campus, faculty names, or staff-only numbers", async () => {
    const text = JSON.stringify((await portal(a)).body);
    for (const leak of ["Zulu", "SZ1", "TZ1", "Batch Z", "juj", "A2 only", "Secret Faculty", "facultyName", "bufferRatio", ids.bZ!, ids.sz1!, ids.fac!]) expect(text, leak).not.toContain(leak);
    const z1 = (await portal(z)).body;
    expect(z1.batch.name).toBe("Batch Z");
    expect(JSON.stringify(z1)).not.toContain("Alpha");
    expect(z1.exams.map((e: { name: string }) => e.name)).toEqual(["Zulu End-term"]);
  });

  it("ignores or refuses manipulated parameters: a student cannot choose another batch, ever", async () => {
    const other = await portal(a, `?batchId=${ids.bZ}`);
    expect(other.status).toBe(403); expect(other.body.error).toBe("forbidden_batch");
    expect((await portal(a, `?batchId=${ids.bA2}`)).status).toBe(403); // another batch on the same campus and semester
    expect((await portal(a, `?batchId=${ids.bA}`)).status).toBe(200); // naming your own batch is fine
    expect((await request(prod).get(`/api/student/portal?batchId=${ids.bZ}`).set("Cookie", a).set("X-Demo-Batch", ids.bZ!).set("X-Demo-Role", "admin")).status).toBe(403); // headers cannot override the session
  });

  it("a student account with no batch gets a clear 409, not broad access", async () => {
    const res = await portal(none);
    expect(res.status).toBe(409); expect(res.body.error).toBe("no_batch_assigned");
    expect(JSON.stringify(res.body)).not.toContain("Alpha");
  });

  it("is read-only: students cannot write anything, and the portal has no write endpoint", async () => {
    for (const [method, path] of [["post", "/api/faculty"], ["post", "/api/batches"], ["post", "/api/subjects"], ["post", "/api/exams"], ["post", "/api/timetable"], ["post", "/api/semesters"], ["post", "/api/session-logs"], ["post", "/api/calendar/entries"]] as const) {
      expect((await request(prod)[method](path).set("Cookie", a).send({})).status, path).toBe(403);
    }
    expect((await request(prod).put(`/api/subjects/${ids.sa1}/syllabus`).set("Cookie", a).send({ units: [] })).status).toBe(403);
    expect((await request(prod).delete(`/api/timetable/${ids.mon}`).set("Cookie", a)).status).toBe(403);
    expect((await request(prod).get("/api/reports?type=course_progress&campusId=rgib").set("Cookie", a)).status).toBe(403);
    expect((await request(prod).get("/api/session-logs").set("Cookie", a)).status).toBe(403);
    for (const method of ["post", "put", "patch", "delete"] as const) expect((await request(prod)[method]("/api/student/portal").set("Cookie", a).send({})).status, method).toBe(404);
  });

  it("rejects unauthenticated callers and demo headers in production", async () => {
    expect((await request(prod).get("/api/student/portal")).status).toBe(401);
    expect((await request(prod).get("/api/student/portal").set("X-Demo-Role", "student").set("X-Demo-Batch", ids.bA!)).status).toBe(401);
  });

  it("staff keep their existing access, but must name the batch; faculty and admin stay read-only here", async () => {
    expect((await portal(adm)).status).toBe(400);
    expect((await portal(adm, `?batchId=${ids.bZ}`)).body.batch.name).toBe("Batch Z");
    expect((await portal(fac, `?batchId=${ids.bA}`)).status).toBe(200);
    expect((await portal(adm, "?batchId=does-not-exist")).status).toBe(404);
    expect((await request(prod).get("/api/subjects?campusId=rgib").set("Cookie", fac)).status).toBe(200); // unchanged
    expect((await request(prod).post("/api/faculty").set("Cookie", fac).send({ name: "x", campusId: "rgib" })).status).toBe(403); // unchanged
    expect((await request(prod).post("/api/faculty").set("Cookie", adm).send({ name: "Admin Added", campusId: "rgib" })).status).toBe(201); // unchanged
  });

  it("development demo mode: X-Demo-Role student + X-Demo-Batch works (labelled demo, not security); without a batch it is a 409", async () => {
    const withBatch = await request(dev).get("/api/student/portal").set("X-Demo-Role", "student").set("X-Demo-Batch", ids.bA!);
    expect(withBatch.status).toBe(200); expect(withBatch.body.batch.id).toBe(ids.bA);
    expect((await request(dev).get("/api/student/portal").set("X-Demo-Role", "student")).status).toBe(409);
    expect((await request(dev).get("/api/student/portal")).status).toBe(401);
  });

  it("reading the portal changes nothing: existing progression numbers are untouched", async () => {
    const before = (await request(prod).get(`/api/progression/subjects/${ids.sa1}`).set("Cookie", adm)).body.progress;
    expect(before.coveragePct).toBe(66.67);
    await portal(a);
    expect((await request(prod).get(`/api/progression/subjects/${ids.sa1}`).set("Cookie", adm)).body.progress.coveragePct).toBe(66.67);
  });
});
