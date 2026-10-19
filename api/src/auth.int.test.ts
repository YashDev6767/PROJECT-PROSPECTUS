/** Integration (real PostgreSQL): faculty identity comes from the signed session, not from a header the browser can set. */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDatabase, type Database } from "./db/client.js";
import { hashPassword } from "./services/auth.js";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("session-bound faculty ownership (PostgreSQL)", () => {
  let db: Database;
  let app: ReturnType<typeof createApp>;
  const ids: Record<string, string> = {};
  const clock = new Date("2026-10-05T08:00:00Z");
  const cookie = async (email: string, password: string) => String((await request(app).post("/api/auth/login").send({ email, password })).headers["set-cookie"]?.[0]).split(";")[0]!;
  const logBody = (subjectId: string) => ({ subjectId, heldOn: "2026-09-07", timetableEntryId: ids[subjectId === ids.s1 ? "slot1" : "slot2"], outcome: "CANCELLED", notes: "Faculty on leave" });

  beforeAll(async () => {
    execSync("npx prisma migrate deploy", { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    db = createDatabase(url);
    await db.prisma!.$executeRawUnsafe(`TRUNCATE "SessionTopicEntry","SessionLogRevision","SessionLog","Exam","CalendarEntry","TimetableEntry","SyllabusTopic","SyllabusUnit","Subject","Batch","Faculty","Semester" RESTART IDENTITY CASCADE`);
    const setup = createApp({ CORS_ORIGIN: "http://localhost:5173" }, db, () => clock);
    const as = (t: request.Test) => t.set("X-Demo-Role", "admin");
    ids.sem = (await as(request(setup).post("/api/semesters")).send({ name: "Sem", academicYear: "2026-27", track: "MIRAI", campusId: "rgib", startsOn: "2026-09-07", endsOn: "2026-12-18", saturdayRule: "NONE" })).body.id;
    await as(request(setup).post(`/api/semesters/${ids.sem}/activate`)).send({});
    const batch = (await as(request(setup).post("/api/batches")).send({ name: "B", semesterId: ids.sem })).body.id;
    ids.fa = (await as(request(setup).post("/api/faculty")).send({ name: "Faculty A", campusId: "rgib" })).body.id;
    ids.fb = (await as(request(setup).post("/api/faculty")).send({ name: "Faculty B", campusId: "rgib" })).body.id;
    ids.s1 = (await as(request(setup).post("/api/subjects")).send({ code: "A1", name: "Taught by A", batchId: batch, facultyId: ids.fa })).body.id;
    ids.s2 = (await as(request(setup).post("/api/subjects")).send({ code: "B1", name: "Taught by B", batchId: batch, facultyId: ids.fb })).body.id;
    ids.slot1 = (await as(request(setup).post("/api/timetable")).send({ subjectId: ids.s1, weekday: 1, startTime: "09:00", endTime: "10:00" })).body.id;
    ids.slot2 = (await as(request(setup).post("/api/timetable")).send({ subjectId: ids.s2, weekday: 1, startTime: "11:00", endTime: "12:00" })).body.id;
    const users = JSON.stringify([
      { email: "a@msot.test", role: "faculty", facultyId: ids.fa, passwordHash: hashPassword("faculty-a-passphrase") },
      { email: "admin@msot.test", role: "admin", passwordHash: hashPassword("admin-passphrase-1") },
    ]);
    app = createApp({ CORS_ORIGIN: "http://localhost:5173", AUTH_USERS: users, SESSION_SECRET: "s".repeat(40), NODE_ENV: "production", ALLOW_DEMO_HEADERS: false } as never, db, () => clock);
  });
  afterAll(async () => { await db?.close(); });

  it("a faculty session can log its own subject but not another faculty member's, whatever headers are sent", async () => {
    const a = await cookie("a@msot.test", "faculty-a-passphrase");
    const other = await request(app).post("/api/session-logs").set("Cookie", a).set("X-Demo-Faculty", ids.fb!).send(logBody(ids.s2!));
    expect(other.status).toBe(403); expect(other.body.error).toBe("not_your_subject");
    const own = await request(app).post("/api/session-logs").set("Cookie", a).set("X-Demo-Faculty", ids.fb!).send(logBody(ids.s1!));
    expect(own.status).toBe(201);
    expect(own.body.log.loggedByFacultyName).toBe("Faculty A"); // recorded from the verified session, not from the spoofed header
  });
  it("with demo headers off (production mode) nothing works without a session, and an admin session may log for anyone", async () => {
    expect((await request(app).post("/api/session-logs").set("X-Demo-Role", "admin").send(logBody(ids.s2!))).status).toBe(401);
    const admin = await cookie("admin@msot.test", "admin-passphrase-1");
    expect((await request(app).post("/api/session-logs").set("Cookie", admin).send(logBody(ids.s2!))).status).toBe(201);
  });
});
