/**
 * Integration (real PostgreSQL): smart carry-forward. Hand-calculated scenario (campus RGIB, no Saturdays, today = Mon 5 Oct 2026):
 * subject S1 (faculty F1, Batch A): Mon 09:00–10:00 + Wed 09:00–10:30, topics T1..T4 of 4 h each (16 h).
 *   L1 Mon 7 Sep  IN_PROGRESS  T1 100 %, T2 50 %, leftover T3        -> offered on 9 Sep: T2 (2 h left), T3 (4 h left); T1 never
 *   L2 Wed 9 Sep  IN_PROGRESS  T2 100 %, leftover T3                 -> offered on 14 Sep: T3 only; coverage = (4 + 4) / 16 = 50 %
 *   L3 Mon 14 Sep CANCELLED, L4 Wed 16 Sep SKIPPED                   -> still offered on 21 Sep: T3 from L2
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDatabase, type Database } from "./db/client.js";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("smart carry-forward (PostgreSQL)", () => {
  let db: Database;
  let app: ReturnType<typeof createApp>;
  const clock = new Date("2026-10-05T08:00:00Z");
  const ids: Record<string, string> = {};
  const T: string[] = [];
  const admin = (t: request.Test) => t.set("X-Demo-Role", "admin");
  const fac = (id: string) => (t: request.Test) => t.set("X-Demo-Role", "faculty").set("X-Demo-Faculty", id);
  const carry = (subjectId: string, heldOn: string, who: (t: request.Test) => request.Test = admin, extra = "") => who(request(app).get(`/api/session-logs/carry-forward?subjectId=${subjectId}&heldOn=${heldOn}${extra}`));
  const send = async (body: object, who: (t: request.Test) => request.Test = admin) => who(request(app).post("/api/session-logs")).send(body);
  const progress = async () => (await request(app).get(`/api/progression/subjects/${ids.s1}?asOf=2026-10-05`)).body.progress;
  const items = (res: request.Response) => (res.body.items as Array<{ topicId: string }>).map((i) => T.indexOf(i.topicId) + 1);

  beforeAll(async () => {
    execSync("npx prisma migrate deploy", { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    db = createDatabase(url);
    await db.prisma!.$executeRawUnsafe(`TRUNCATE "SessionTopicEntry","SessionLogRevision","SessionLog","Exam","CalendarEntry","TimetableEntry","SyllabusTopic","SyllabusUnit","Subject","Batch","Faculty","Semester" RESTART IDENTITY CASCADE`);
    app = createApp({ CORS_ORIGIN: "http://localhost:5173", DEMO_DEFAULT_CAMPUS: "*" }, db, () => clock);
    const post = async (path: string, body: object) => (await admin(request(app).post(path)).send(body)).body;
    ids.sem = (await post("/api/semesters", { name: "Sem", academicYear: "2026-27", track: "MIRAI", campusId: "rgib", startsOn: "2026-09-07", endsOn: "2026-12-18", saturdayRule: "NONE" })).id;
    await admin(request(app).post(`/api/semesters/${ids.sem}/activate`)).send({});
    ids.batchA = (await post("/api/batches", { name: "Batch A", semesterId: ids.sem })).id;
    ids.batchB = (await post("/api/batches", { name: "Batch B", semesterId: ids.sem })).id;
    ids.f1 = (await post("/api/faculty", { name: "F1", campusId: "rgib" })).id;
    ids.f2 = (await post("/api/faculty", { name: "F2", campusId: "rgib" })).id;
    ids.s1 = (await post("/api/subjects", { code: "S1", name: "Subject One", batchId: ids.batchA, facultyId: ids.f1 })).id;
    ids.s2 = (await post("/api/subjects", { code: "S2", name: "Subject Two", batchId: ids.batchA, facultyId: ids.f2 })).id;
    ids.s3 = (await post("/api/subjects", { code: "S3", name: "Subject Three", batchId: ids.batchB, facultyId: ids.f1 })).id;
    const syl = await admin(request(app).put(`/api/subjects/${ids.s1}/syllabus`)).send({ units: [{ title: "U1", topics: [{ title: "T1", plannedHours: 4 }, { title: "T2", plannedHours: 4 }] }, { title: "U2", topics: [{ title: "T3", plannedHours: 4 }, { title: "T4", plannedHours: 4 }] }] });
    T.push(...syl.body.units.flatMap((u: { topics: Array<{ id: string }> }) => u.topics.map((t) => t.id)));
    const syl3 = await admin(request(app).put(`/api/subjects/${ids.s3}/syllabus`)).send({ units: [{ title: "U", topics: [{ title: "S3-T1", plannedHours: 2 }] }] });
    ids.s3t = syl3.body.units[0].topics[0].id;
    ids.mon = (await post("/api/timetable", { subjectId: ids.s1, weekday: 1, startTime: "09:00", endTime: "10:00" })).id;
    ids.wed = (await post("/api/timetable", { subjectId: ids.s1, weekday: 3, startTime: "09:00", endTime: "10:30" })).id;
    ids.s3mon = (await post("/api/timetable", { subjectId: ids.s3, weekday: 1, startTime: "11:00", endTime: "12:00" })).id;
  });
  afterAll(async () => { await db?.close(); });

  it("offers nothing before any teaching session exists", async () => {
    const res = await carry(ids.s1!, "2026-09-07");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: null, items: [], note: null });
  });

  it("offers the previous session's partly covered and leftover topics, never the completed one", async () => {
    const l1 = await send({ subjectId: ids.s1, heldOn: "2026-09-07", timetableEntryId: ids.mon, outcome: "IN_PROGRESS", covered: [{ topicId: T[0], completionPct: 100 }, { topicId: T[1], completionPct: 50 }], leftover: [T[2]], carryForward: "Finish T2 proof" });
    expect(l1.status).toBe(201); ids.l1 = l1.body.log.id;
    const res = await carry(ids.s1!, "2026-09-09");
    expect(res.body.source).toMatchObject({ logId: ids.l1, heldOn: "2026-09-07", outcome: "IN_PROGRESS" });
    expect(items(res)).toEqual([2, 3]); // T1 (100 %) is not carried
    expect(res.body.items[0]).toMatchObject({ reason: "in_progress", completionPct: 50, remainingHours: 2, plannedHours: 4, fromDate: "2026-09-07", title: "T2", unitTitle: "U1" });
    expect(res.body.items[1]).toMatchObject({ reason: "leftover", completionPct: 0, remainingHours: 4, title: "T3" });
    expect(res.body.note).toBe("Finish T2 proof");
  });

  it("carries only what the previous session left: a later session that completes T2 and keeps T3 leaves T3 alone; coverage is untouched by carrying", async () => {
    const before = await progress();
    const hist = (await admin(request(app).get(`/api/session-logs/${ids.l1}`))).body;
    const l2 = await send({ subjectId: ids.s1, heldOn: "2026-09-09", timetableEntryId: ids.wed, outcome: "IN_PROGRESS", covered: [{ topicId: T[1], completionPct: 100 }], leftover: [T[2]] }); // T3 kept = "selected", T4 not selected
    expect(l2.status).toBe(201); ids.l2 = l2.body.log.id;
    expect(items(await carry(ids.s1!, "2026-09-14"))).toEqual([3]);
    const after = await progress();
    expect(after.coveragePct).toBe(50); // (T1 4 h + T2 4 h) / 16 h — leftover entries never count as progress
    expect(after.coveredHours - before.coveredHours).toBe(2); // only T2's remaining 50 % (2 h) was newly covered
    // the original record is byte-for-byte what it was
    const histAfter = (await admin(request(app).get(`/api/session-logs/${ids.l1}`))).body;
    expect(histAfter).toEqual(hist);
    expect(histAfter.revision).toBe(1);
  });

  it("is safe to retry or correct: no duplicate log, no duplicate topic entries, no duplicate offers", async () => {
    const retry = await send({ subjectId: ids.s1, heldOn: "2026-09-09", timetableEntryId: ids.wed, outcome: "IN_PROGRESS", covered: [{ topicId: T[1], completionPct: 100 }], leftover: [T[2]] });
    expect(retry.status).toBe(409); expect(retry.body.error).toBe("duplicate_log"); expect(retry.body.existingLogId).toBe(ids.l2);
    const dupTopic = await send({ subjectId: ids.s1, heldOn: "2026-09-14", timetableEntryId: ids.mon, outcome: "IN_PROGRESS", covered: [{ topicId: T[2], completionPct: 30 }], leftover: [T[2]] });
    expect(dupTopic.status).toBe(400); expect(JSON.stringify(dupTopic.body.issues)).toMatch(/listed more than once/);
    const fix = await admin(request(app).patch(`/api/session-logs/${ids.l2}`)).send({ leftover: [T[2]], correctionNote: "same carry-forward, resubmitted" });
    expect(fix.status).toBe(200);
    const row = await db.prisma!.sessionLog.findUniqueOrThrow({ where: { id: ids.l2 }, include: { topicEntries: true } });
    expect(row.topicEntries).toHaveLength(2); // T2 covered + T3 leftover, exactly once each
    expect(await db.prisma!.sessionLog.count({ where: { subjectId: ids.s1 } })).toBe(2);
    const res = await carry(ids.s1!, "2026-09-14");
    expect(items(res)).toEqual([3]);
    expect(res.body.items).toHaveLength(1);
  });

  it("while correcting a log, its own work is not offered back (excludeLogId): the earlier session is the source", async () => {
    const res = await carry(ids.s1!, "2026-09-09", admin, `&excludeLogId=${ids.l2}`);
    expect(res.body.source.logId).toBe(ids.l1);
    expect(items(res)).toEqual([2, 3]);
    expect(items(await carry(ids.s1!, "2026-09-09"))).toEqual([2, 3]); // same date: the 9 Sep log itself is never a source for 9 Sep
  });

  it("cancelled and skipped sessions are passed over: the last teaching session still supplies the unfinished work", async () => {
    expect((await send({ subjectId: ids.s1, heldOn: "2026-09-14", timetableEntryId: ids.mon, outcome: "CANCELLED", notes: "Faculty on leave" })).status).toBe(201);
    expect((await send({ subjectId: ids.s1, heldOn: "2026-09-16", timetableEntryId: ids.wed, outcome: "SKIPPED", notes: "Holiday workshop" })).status).toBe(201);
    const res = await carry(ids.s1!, "2026-09-21");
    expect(res.body.source).toMatchObject({ logId: ids.l2, heldOn: "2026-09-09" });
    expect(items(res)).toEqual([3]);
  });

  it("an explicitly skipped topic is excluded from what is offered", async () => {
    expect((await send({ subjectId: ids.s1, heldOn: "2026-09-21", timetableEntryId: ids.mon, outcome: "IN_PROGRESS", covered: [{ topicId: T[3], completionPct: 20 }], skipped: [T[2]] })).status).toBe(201);
    const res = await carry(ids.s1!, "2026-09-23");
    expect(items(res)).toEqual([4]); // T4 at 20 % is offered; T3 (skipped) is not
    expect(res.body.items[0]).toMatchObject({ completionPct: 20, remainingHours: 3.2 });
  });

  it("matches by subject: another subject of the same batch, and a subject of another batch with the same faculty, see only their own history", async () => {
    expect(items(await carry(ids.s2!, "2026-09-30"))).toEqual([]); // S2: same batch, never logged
    expect((await send({ subjectId: ids.s3, heldOn: "2026-09-07", timetableEntryId: ids.s3mon, outcome: "IN_PROGRESS", covered: [{ topicId: ids.s3t, completionPct: 40 }] })).status).toBe(201);
    const res = await carry(ids.s3!, "2026-09-14");
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ topicId: ids.s3t, title: "S3-T1", completionPct: 40, remainingHours: 1.2 });
    expect(T).not.toContain(res.body.items[0].topicId);
    expect(items(await carry(ids.s1!, "2026-09-23"))).toEqual([4]); // S1 unaffected by S3's logs
  });

  it("keeps the existing authorization: a faculty member sees only their own subject, students and anonymous callers are refused", async () => {
    expect((await carry(ids.s1!, "2026-09-14", fac(ids.f1!))).status).toBe(200);
    const other = await carry(ids.s1!, "2026-09-14", fac(ids.f2!));
    expect(other.status).toBe(404); // a colleague's subject looks nonexistent
    expect((await carry(ids.s1!, "2026-09-14", (t) => t.set("X-Demo-Role", "faculty"))).status).toBe(404); // no faculty identity chosen
    expect((await carry(ids.s1!, "2026-09-14", (t) => t.set("X-Demo-Role", "student"))).status).toBe(403);
    expect((await carry(ids.s1!, "2026-09-14", (t) => t)).status).toBe(401);
  });

  it("validates its input and reports a missing subject", async () => {
    expect((await carry("nope", "2026-09-14")).status).toBe(404);
    expect((await admin(request(app).get("/api/session-logs/carry-forward?subjectId=x"))).status).toBe(400);
    expect((await admin(request(app).get(`/api/session-logs/carry-forward?subjectId=${ids.s1}&heldOn=2026-13-40`))).status).toBe(400);
  });

  it("existing progression numbers stay hand-correct after all of this (T1 + T2 covered, T4 at 20 %, T3 skipped leaves scope)", async () => {
    const p = await progress();
    // scope = T1 + T2 + T4 = 12 h; covered = 4 + 4 + 0.8 = 8.8 h -> 73.33 %
    expect(p.hoursInScope).toBe(12); expect(p.coveredHours).toBe(8.8); expect(p.coveragePct).toBe(73.33);
  });
});
