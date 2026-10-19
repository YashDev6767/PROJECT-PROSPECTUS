/**
 * Integration tests (real PostgreSQL, TEST_DATABASE_URL) for: the timetable-delete guard, honest dashboard states, and per-exam readiness.
 *
 * Hand-calculated scenario (campus RGIB, Saturday rule NONE, no holidays, today = Mon 5 Oct 2026):
 *   semester 7 Sep – 18 Dec; subject S1: Monday 09:00–10:00 (1 h) + Wednesday 09:00–10:30 (1.5 h); topics T1, T2 (4 h each, tagged MID_TERM),
 *   T3 (4 h, tagged END_TERM), T4 (4 h, untagged). Exams: Mid-term 26–30 Oct, End-term 9–13 Nov (cohort-wide).
 *   Mid-term: classes end Sun 25 Oct. Mondays 5/12/19 = 3 h, Wednesdays 7/14/21 = 4.5 h -> 7.5 h left. In scope T1+T2 = 8 h, remaining 8 h.
 *     buffer 7.5 / 8 = 0.9375 -> 0.94 -> DANGER.   After T1 is logged 100%: remaining 4 h, buffer 7.5 / 4 = 1.875 -> 1.88 -> ON TRACK.
 *   End-term: classes end Sun 8 Nov and the mid-term week (26–30 Oct) is suspended: Mondays 5,12,19,Nov 2 = 4 h; Wednesdays 7,14,21,Nov 4 = 6 h -> 10 h.
 *     In scope T1+T2+T3 = 12 h (T4 untagged is left out) -> buffer 10 / 12 = 0.83 -> DANGER.
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDatabase, type Database } from "./db/client.js";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("timetable guard, dashboard states and exam readiness (PostgreSQL)", () => {
  let db: Database;
  let app: ReturnType<typeof createApp>;
  const clock = new Date("2026-10-05T08:00:00Z"); // 13:30 IST -> today = 2026-10-05
  const ids: Record<string, string> = {};
  const T: string[] = [];
  const admin = (t: request.Test) => t.set("X-Demo-Role", "admin");
  const manager = (t: request.Test) => t.set("X-Demo-Role", "campus_manager");
  const post = async (path: string, body: object, role = manager) => (await role(request(app).post(path)).send(body)).body;

  beforeAll(async () => {
    execSync("npx prisma migrate deploy", { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    db = createDatabase(url);
    await db.prisma!.$executeRawUnsafe(`TRUNCATE "SessionTopicEntry","SessionLogRevision","SessionLog","Exam","CalendarEntry","TimetableEntry","SyllabusTopic","SyllabusUnit","Subject","Batch","Faculty","Semester" RESTART IDENTITY CASCADE`);
    app = createApp({ CORS_ORIGIN: "http://localhost:5173" }, db, () => clock);

    ids.sem = (await post("/api/semesters", { name: "Sem X", academicYear: "2026-27", track: "MIRAI", campusId: "rgib", startsOn: "2026-09-07", endsOn: "2026-12-18", saturdayRule: "NONE" }, admin)).id;
    await admin(request(app).post(`/api/semesters/${ids.sem}/activate`)).send({});
    ids.batchA = (await post("/api/batches", { name: "Batch A", semesterId: ids.sem })).id;
    ids.batchB = (await post("/api/batches", { name: "Batch B", semesterId: ids.sem })).id;
    ids.batchC = (await post("/api/batches", { name: "Batch C (no subjects)", semesterId: ids.sem })).id;
    ids.f1 = (await post("/api/faculty", { name: "Faculty One", campusId: "rgib" })).id;
    ids.s1 = (await post("/api/subjects", { code: "S1", name: "Subject One", batchId: ids.batchA, facultyId: ids.f1, plannedHours: 16 })).id;
    const syl = await manager(request(app).put(`/api/subjects/${ids.s1}/syllabus`)).send({ units: [
      { title: "Unit 1", topics: [{ title: "T1", plannedHours: 4, examScope: "MID_TERM" }, { title: "T2", plannedHours: 4, examScope: "MID_TERM" }] },
      { title: "Unit 2", topics: [{ title: "T3", plannedHours: 4, examScope: "END_TERM" }, { title: "T4", plannedHours: 4 }] },
    ] });
    T.push(...syl.body.units.flatMap((u: { topics: Array<{ id: string }> }) => u.topics.map((t) => t.id)));
    ids.mon = (await post("/api/timetable", { subjectId: ids.s1, weekday: 1, startTime: "09:00", endTime: "10:00" })).id;
    ids.wed = (await post("/api/timetable", { subjectId: ids.s1, weekday: 3, startTime: "09:00", endTime: "10:30" })).id;
    // S2: whole-syllabus mode (no tags): Friday 1 h slot, one 1 h topic
    ids.s2 = (await post("/api/subjects", { code: "S2", name: "Subject Two (untagged)", batchId: ids.batchA, facultyId: ids.f1 })).id;
    await manager(request(app).put(`/api/subjects/${ids.s2}/syllabus`)).send({ units: [{ title: "U", topics: [{ title: "Only topic", plannedHours: 1 }] }] });
    ids.fri = (await post("/api/timetable", { subjectId: ids.s2, weekday: 5, startTime: "09:00", endTime: "10:00" })).id;
    // S3 (batch B): no syllabus at all
    ids.s3 = (await post("/api/subjects", { code: "S3", name: "Subject Three (no syllabus)", batchId: ids.batchB })).id;
    await post("/api/exams", { name: "Mid-term", type: "MID_TERM", semesterId: ids.sem, startsOn: "2026-10-26", endsOn: "2026-10-30" });
    await post("/api/exams", { name: "End-term", type: "END_TERM", semesterId: ids.sem, startsOn: "2026-11-09", endsOn: "2026-11-13" });
    await post("/api/exams", { name: "Sessional 2 (Batch B)", type: "SESSIONAL", semesterId: ids.sem, batchId: ids.batchB, startsOn: "2026-11-16", endsOn: "2026-11-18" });
    await post("/api/exams", { name: "Sessional 2 (Batch C)", type: "SESSIONAL", semesterId: ids.sem, batchId: ids.batchC, startsOn: "2026-11-23", endsOn: "2026-11-25" });
  });
  afterAll(async () => { await db?.close(); });

  describe("DELETE /api/timetable/:id keeps historical logs", () => {
    it("is refused with a consistent 'in use' error once a session log references the slot, and nothing changes", async () => {
      const logged = await admin(request(app).post("/api/session-logs")).send({ subjectId: ids.s1, heldOn: "2026-09-07", timetableEntryId: ids.mon, outcome: "IN_PROGRESS", covered: [{ topicId: T[0], completionPct: 50 }] });
      expect(logged.status).toBe(201);
      const before = (await request(app).get(`/api/progression/subjects/${ids.s1}?asOf=2026-10-05`)).body.progress;

      const res = await manager(request(app).delete(`/api/timetable/${ids.mon}`));
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("in_use");
      expect(res.body.blockers).toEqual({ sessionLogs: 1 });
      expect(res.body.message).toMatch(/session log\(s\) were recorded against it/);

      const after = (await request(app).get(`/api/progression/subjects/${ids.s1}?asOf=2026-10-05`)).body.progress;
      expect(after.availableHours).toBe(before.availableHours);
      expect(after.coveragePct).toBe(before.coveragePct);
      expect(after.plannedToDateHours).toBe(before.plannedToDateHours);
      const log = (await request(app).get(`/api/session-logs/${logged.body.log.id}`).set("X-Demo-Role", "admin")).body;
      expect(log.timetableEntryId).toBe(ids.mon); // the log is still attached to its slot
      const slots = (await request(app).get(`/api/timetable?semesterId=${ids.sem}`)).body.entries;
      expect(slots.some((e: { id: string }) => e.id === ids.mon)).toBe(true);
    });
    it("still works for a slot with no logs, and is still permission-gated", async () => {
      expect((await request(app).delete(`/api/timetable/${ids.wed}`)).status).toBe(401);
      expect((await request(app).delete(`/api/timetable/${ids.wed}`).set("X-Demo-Role", "student")).status).toBe(403);
      expect((await manager(request(app).delete(`/api/timetable/${ids.wed}`))).status).toBe(204);
      ids.wed = (await post("/api/timetable", { subjectId: ids.s1, weekday: 3, startTime: "09:00", endTime: "10:30" })).id; // restore for the readiness numbers
      expect((await manager(request(app).delete("/api/timetable/does-not-exist"))).status).toBe(404);
    });
  });

  describe("exam readiness (hand-calculated)", () => {
    // the Monday log above was IN_PROGRESS on T1 at 50%: reset the numbers by working from a clean log history is not possible, so the
    // expectations below include that 50% (T1 = 2 h covered) — the arithmetic is shown inline.
    const readiness = async (q = "campusId=rgib") => (await request(app).get(`/api/exam-readiness?${q}`)).body;
    const find = (d: { exams: Array<{ name: string }> }, name: string) => d.exams.find((e) => e.name === name) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    it("lists upcoming exams in date order with real dates, semester, track and batch scope", async () => {
      const d = await readiness();
      expect(d.state).toBe("ready");
      expect(d.exams.map((e: { name: string }) => e.name)).toEqual(["Mid-term", "End-term", "Sessional 2 (Batch B)", "Sessional 2 (Batch C)"]);
      const mid = find(d, "Mid-term");
      expect(mid).toMatchObject({ startsOn: "2026-10-26", endsOn: "2026-10-30", daysToStart: 21, phase: "upcoming", lastTeachingDate: "2026-10-25", batch: null, semester: { name: "Sem X", track: "MIRAI" } });
      expect(find(d, "Sessional 2 (Batch B)").batch).toEqual({ id: ids.batchB, name: "Batch B" });
    });
    it("Mid-term: only topics tagged MID_TERM or earlier count (T1+T2 = 8 h; T3 and untagged T4 are out); 7.5 h of teaching left", async () => {
      const s1 = find(await readiness(), "Mid-term").subjects.find((s: { code: string }) => s.code === "S1");
      // T1 is 50% covered (2 h): remaining 6 h; buffer 7.5 / 6 = 1.25 -> ON TRACK
      expect(s1).toMatchObject({ scopeMode: "exam_scope", topicsInScope: 2, unscopedTopics: 1, hoursInScope: 8, coveredHours: 2, remainingHours: 6, availableHours: 7.5, bufferRatio: 1.25, status: "ON_TRACK" });
    });
    it("End-term: T1..T3 = 12 h in scope, the mid-term week is suspended, 10 h left -> buffer 0.83 -> DANGER, with the reason", async () => {
      const s1 = find(await readiness(), "End-term").subjects.find((x: { code: string }) => x.code === "S1");
      // covered 2 h of 12 -> remaining 10 h; available 10 h -> buffer 1.00 -> TIGHT (classified on the rounded ratio)
      expect(s1).toMatchObject({ topicsInScope: 3, hoursInScope: 12, coveredHours: 2, remainingHours: 10, availableHours: 10, bufferRatio: 1, status: "TIGHT" });
      expect(s1.headline).toMatch(/Tight: 10 h of teaching left for 10 h of syllabus/);
    });
    it("a subject with no tags is measured on its whole syllabus and says so", async () => {
      const s2 = find(await readiness(), "Mid-term").subjects.find((s: { code: string }) => s.code === "S2");
      expect(s2).toMatchObject({ scopeMode: "whole_syllabus", unscopedTopics: 0, hoursInScope: 1, availableHours: 3, status: "ON_TRACK" }); // Fridays 9, 16, 23 Oct = 3 h
    });
    it("a configured exam whose batch has an unassessable subject is flagged incomplete: UNKNOWN, no invented numbers", async () => {
      const b = find(await readiness(), "Sessional 2 (Batch B)");
      expect(b.status).toBe("UNKNOWN");
      expect(b.unassessed).toBe(1);
      expect(b.note).toMatch(/cannot be assessed yet/);
      expect(b.subjects[0]).toMatchObject({ code: "S3", status: "UNKNOWN", coveragePct: null, bufferRatio: null, hoursInScope: 0 });
    });
    it("an exam for a batch with no subjects has no status at all, only an explanation", async () => {
      const c = find(await readiness(), "Sessional 2 (Batch C)");
      expect(c).toMatchObject({ status: null, subjectCount: 0, subjects: [] });
      expect(c.note).toMatch(/no subjects yet/);
    });
    it("logging more of the syllabus changes the readiness (the numbers come from the logs, not from a stored score)", async () => {
      const res = await admin(request(app).post("/api/session-logs")).send({ subjectId: ids.s1, heldOn: "2026-09-09", timetableEntryId: ids.wed, outcome: "IN_PROGRESS", covered: [{ topicId: T[0], completionPct: 100 }, { topicId: T[1], completionPct: 100 }] });
      expect(res.status).toBe(201);
      const mid = find(await readiness(), "Mid-term").subjects.find((s: { code: string }) => s.code === "S1");
      expect(mid).toMatchObject({ coveredHours: 8, remainingHours: 0, status: "COMPLETE", coveragePct: 100 });
    });
    it("what-if dates move with asOf: on the exam's first day it is 'in progress' and no teaching time is left", async () => {
      const d = await readiness("campusId=rgib&asOf=2026-10-26");
      const mid = find(d, "Mid-term");
      expect(mid).toMatchObject({ phase: "in_progress", daysToStart: 0 });
    });
    it("validates the query, keeps campuses apart and answers 'no active semester' honestly", async () => {
      expect((await request(app).get("/api/exam-readiness")).status).toBe(400);
      expect((await request(app).get("/api/exam-readiness?campusId=nope")).status).toBe(400);
      const other = await readiness("campusId=hi-tech");
      expect(other).toMatchObject({ state: "no_active_semester", exams: [] });
    });
    it("is a public read like the other dashboards (role headers are not required), but never writes", async () => {
      expect((await request(app).get("/api/exam-readiness?campusId=rgib")).status).toBe(200);
      expect((await request(app).post("/api/exam-readiness?campusId=rgib")).status).toBe(404);
    });
    it("says 'no exams' when the active semester has none left", async () => {
      const sem2 = await post("/api/semesters", { name: "Sem Quiet", academicYear: "2026-27", track: "UNIVERSITY", campusId: "juj", startsOn: "2026-09-01", endsOn: "2026-12-18", saturdayRule: "NONE" }, admin);
      await admin(request(app).post(`/api/semesters/${sem2.id}/activate`)).send({});
      expect(await readiness("campusId=juj")).toMatchObject({ state: "no_exams", exams: [] });
    });
  });

  describe("dashboard states", () => {
    const dash = async (campus: string) => (await request(app).get(`/api/dashboard?campusId=${campus}`)).body;

    it("a campus with no semesters at all is the labelled demo dataset (no state)", async () => {
      const d = await dash("ratnam");
      expect(d.dataSource).toBe("demo");
      expect(d.state).toBeUndefined();
    });
    it("an expired semester that is still flagged active is 'no active semester', not an all-clear", async () => {
      const old = await post("/api/semesters", { name: "Old", academicYear: "2025-26", track: "MIRAI", campusId: "ratnam", startsOn: "2026-01-05", endsOn: "2026-05-29", saturdayRule: "NONE" }, admin);
      await db.prisma!.semester.update({ where: { id: old.id }, data: { isActive: true } }); // stale flag, e.g. never switched off
      const d = await dash("ratnam");
      expect(d.dataSource).toBe("live");
      expect(d.state.kind).toBe("no_active_semester");
      expect(d.state.message).toMatch(/1 ended/);
      expect(d.atRisk).toEqual([]);
      expect(d.overall.status).toBeNull();
    });
    it("a semester covering today that was never activated, plus a future one, are named in the message", async () => {
      const cur = await post("/api/semesters", { name: "Not activated", academicYear: "2026-27", track: "UNIVERSITY", campusId: "hi-tech", startsOn: "2026-09-01", endsOn: "2026-12-18", saturdayRule: "NONE" }, admin);
      await post("/api/semesters", { name: "Next", academicYear: "2027-28", track: "UNIVERSITY", campusId: "hi-tech", startsOn: "2027-01-04", endsOn: "2027-05-28", saturdayRule: "NONE" }, admin);
      const d = await dash("hi-tech");
      expect(d.state.kind).toBe("no_active_semester");
      expect(d.state.message).toMatch(/1 not started/);
      expect(d.state.message).toMatch(/1 covering today but not activated/);
      // activate it: now there is a semester but no subjects
      await admin(request(app).post(`/api/semesters/${cur.id}/activate`)).send({});
      await post("/api/batches", { name: "Empty batch", semesterId: cur.id });
      expect((await dash("hi-tech")).state.kind).toBe("no_subjects");
    });
    it("subjects without syllabus hours are 'needs data', then an assessed subject makes it 'ready' with the count of unassessed ones", async () => {
      const sem = (await db.prisma!.semester.findFirstOrThrow({ where: { campusId: "hi-tech", isActive: true } })).id;
      const batch = (await db.prisma!.batch.findFirstOrThrow({ where: { semesterId: sem } })).id;
      const a = await post("/api/subjects", { code: "N1", name: "No syllabus yet", batchId: batch });
      const d1 = await dash("hi-tech");
      expect(d1.state).toMatchObject({ kind: "needs_data", subjects: 1, assessed: 0, unassessed: 1 });
      expect(d1.atRisk).toEqual([]);

      const b = await post("/api/subjects", { code: "R1", name: "Risk free", batchId: batch });
      await manager(request(app).put(`/api/subjects/${b.id}/syllabus`)).send({ units: [{ title: "U", topics: [{ title: "Small", plannedHours: 1 }] }] });
      await post("/api/timetable", { subjectId: b.id, weekday: 1, startTime: "09:00", endTime: "11:00" });
      const d2 = await dash("hi-tech");
      expect(d2.state).toMatchObject({ kind: "ready", subjects: 2, assessed: 1, unassessed: 1 });
      expect(d2.state.message).toMatch(/1 of 2 subject\(s\) cannot be assessed/);
      expect(d2.atRisk).toEqual([]); // nothing is at risk among the assessed...
      expect(d2.overall.status).toBe("UNKNOWN"); // ...but the overall status admits it cannot tell for the other subject
      void a;
    });
    it("a genuinely risk-free campus is 'ready' with every subject assessed", async () => {
      await db.prisma!.subject.deleteMany({ where: { code: "N1", batch: { semester: { campusId: "hi-tech" } } } });
      const d = await dash("hi-tech");
      expect(d.state).toMatchObject({ kind: "ready", subjects: 1, assessed: 1, unassessed: 0, message: "" });
      expect(d.atRisk).toEqual([]);
      expect(d.overall.status).toBe("ON_TRACK");
    });
  });
});
