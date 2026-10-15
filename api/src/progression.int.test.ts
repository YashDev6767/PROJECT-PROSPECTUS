/**
 * Phase 3 integration tests against a REAL PostgreSQL (TEST_DATABASE_URL): session logging, duplicate prevention, ownership,
 * merged / cancelled / rescheduled sessions, and progression numbers that were calculated BY HAND (see progress.reference.test.ts).
 *
 * Scenario (campus RGIB, Saturday rule NONE, no holidays): Monday 09:00-10:00 (1 h) + Wednesday 09:00-10:30 (1.5 h);
 * topics T1-T4 of 4 h each; semester starts Mon 7 Sep 2026; End-term starts Mon 9 Nov -> last teaching day 8 Nov; reference date 5 Oct.
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDatabase, type Database } from "./db/client.js";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("session logging and progression (PostgreSQL)", () => {
  let db: Database;
  let app: ReturnType<typeof createApp>;
  let clock = new Date("2026-10-05T08:00:00Z"); // 13:30 in Asia/Kolkata -> today = 2026-10-05
  const REF = "2026-10-05";
  const ids: Record<string, string> = {};
  const T: string[] = []; // topic ids of subject S1: T1..T4

  const admin = (t: request.Test) => t.set("X-Demo-Role", "admin");
  const manager = (t: request.Test) => t.set("X-Demo-Role", "campus_manager");
  const faculty = (facultyId: string | undefined) => (t: request.Test) => t.set("X-Demo-Role", "faculty").set("X-Demo-Faculty", facultyId ?? "");
  const progress = async (subjectId: string | undefined, asOf = REF) => (await request(app).get(`/api/progression/subjects/${subjectId}?asOf=${asOf}`)).body;

  beforeAll(async () => {
    execSync("npx prisma migrate deploy", { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    db = createDatabase(url);
    await db.prisma!.$executeRawUnsafe(`TRUNCATE "SessionTopicEntry","SessionLogRevision","SessionLog","Exam","CalendarEntry","TimetableEntry","SyllabusTopic","SyllabusUnit","Subject","Batch","Faculty","Semester" RESTART IDENTITY CASCADE`);
    app = createApp({ CORS_ORIGIN: "http://localhost:5173" }, db, () => clock);

    const sem = await admin(request(app).post("/api/semesters")).send({ name: "Sem X", academicYear: "2026-27", track: "MIRAI", campusId: "rgib", startsOn: "2026-09-07", endsOn: "2026-12-18", saturdayRule: "NONE" });
    ids.sem = sem.body.id;
    await admin(request(app).post(`/api/semesters/${ids.sem}/activate`)).send({});
    ids.batchA = (await manager(request(app).post("/api/batches")).send({ name: "Batch A", semesterId: ids.sem })).body.id;
    ids.f1 = (await manager(request(app).post("/api/faculty")).send({ name: "Faculty One", campusId: "rgib" })).body.id;
    ids.f2 = (await manager(request(app).post("/api/faculty")).send({ name: "Faculty Two", campusId: "rgib" })).body.id;
    ids.s1 = (await manager(request(app).post("/api/subjects")).send({ code: "S1", name: "Subject One", batchId: ids.batchA, facultyId: ids.f1, plannedHours: 16 })).body.id;
    const syl = await manager(request(app).put(`/api/subjects/${ids.s1}/syllabus`)).send({ units: [
      { title: "Unit 1", topics: [{ title: "T1", plannedHours: 4 }, { title: "T2", plannedHours: 4 }] },
      { title: "Unit 2", topics: [{ title: "T3", plannedHours: 4 }, { title: "T4", plannedHours: 4 }] },
    ] });
    T.push(...syl.body.units.flatMap((u: { topics: Array<{ id: string }> }) => u.topics.map((t) => t.id)));
    ids.mon = (await manager(request(app).post("/api/timetable")).send({ subjectId: ids.s1, weekday: 1, startTime: "09:00", endTime: "10:00" })).body.id;
    ids.wed = (await manager(request(app).post("/api/timetable")).send({ subjectId: ids.s1, weekday: 3, startTime: "09:00", endTime: "10:30" })).body.id;
    await manager(request(app).post("/api/exams")).send({ name: "End-term", type: "END_TERM", semesterId: ids.sem, startsOn: "2026-11-09", endsOn: "2026-11-13" });
  });
  afterAll(async () => { await db?.close(); });

  const log = (entry: string | undefined, heldOn: string, extra: object = {}) => ({ subjectId: ids.s1, heldOn, timetableEntryId: entry, outcome: "IN_PROGRESS", ...extra });

  describe("planned schedule and the hand-calculated ON TRACK reference", () => {
    it("lists a day's planned classes and explains empty days", async () => {
      const mon = await request(app).get("/api/session-logs/schedule?date=2026-09-07&campusId=rgib");
      expect(mon.body.items).toHaveLength(1);
      expect(mon.body.items[0]).toMatchObject({ subjectCode: "S1", batchName: "Batch A", startTime: "09:00", endTime: "10:00", hours: 1, log: null, kind: "scheduled" });
      const sat = await request(app).get("/api/session-logs/schedule?date=2026-09-12&campusId=rgib"); // Saturday, rule NONE
      expect(sat.body.items).toEqual([]);
      const sun = await request(app).get("/api/session-logs/schedule?date=2026-09-13&campusId=rgib");
      expect(sun.body.items).toEqual([]);
      // a day the timetable would use but the calendar blocks reports why
      expect((await request(app).get("/api/session-logs/schedule?date=2026-11-09&campusId=rgib")).body.notices[0].reason).toBe("exam_period");
    });

    it("shows the 4 past classes that still need a log", async () => {
      const pend = await request(app).get("/api/session-logs/pending?campusId=rgib&days=14");
      expect(pend.body.items.map((i: { date: string }) => i.date)).toEqual(["2026-09-30", "2026-09-28", "2026-09-23", "2026-09-21"]);
    });

    it("logs four sessions as faculty (T1 50%, T1 100%, T2 25%, T2 50%) and recalculates after each", async () => {
      const post = async (entry: string | undefined, d: string, covered: object[]) => faculty(ids.f1)(request(app).post("/api/session-logs")).send(log(entry, d, { outcome: covered.some((c) => (c as { completionPct: number }).completionPct < 100) ? "IN_PROGRESS" : "COMPLETED", covered }));
      const a = await post(ids.mon, "2026-09-07", [{ topicId: T[0], completionPct: 50 }]);
      expect(a.status).toBe(201);
      expect(a.body.log).toMatchObject({ outcome: "IN_PROGRESS", loggedByRole: "faculty", revision: 1, hoursTaught: 1 });
      expect(a.body.progress.before.coveredHours).toBe(0);
      expect(a.body.progress.after.coveredHours).toBe(2);
      expect((await post(ids.wed, "2026-09-09", [{ topicId: T[0], completionPct: 100 }])).status).toBe(201);
      expect((await post(ids.mon, "2026-09-14", [{ topicId: T[1], completionPct: 25 }])).status).toBe(201);
      const last = await post(ids.wed, "2026-09-16", [{ topicId: T[1], completionPct: 50 }]);
      expect(last.body.log.hoursTaught).toBe(1.5); // derived from the timetable slot, not typed in
      ids.logSep16 = last.body.log.id;
      expect(last.body.progress.after).toMatchObject({ coveredHours: 6, remainingHours: 10, coveragePct: 37.5, availableHours: 12.5, bufferRatio: 1.25, risk: "ON_TRACK", paceHours: -4 });
    });

    it("GET progression returns the hand-calculated reference numbers and per-topic detail", async () => {
      const p = await progress(ids.s1);
      expect(p.progress).toMatchObject({ hoursInScope: 16, coveredHours: 6, remainingHours: 10, coveragePct: 37.5, plannedToDateHours: 10, paceHours: -4, availableHours: 12.5, bufferRatio: 1.25, risk: "ON_TRACK", projectedCompletion: "2026-10-28", unloggedPastSessions: 4 });
      expect(p.deadline).toMatchObject({ date: "2026-11-09", lastTeachingDate: "2026-11-08", source: "exam" });
      expect(p.progress.topics.map((t: { plannedEnd: string }) => t.plannedEnd)).toEqual(["2026-09-16", "2026-09-28", "2026-10-07", "2026-10-19"]);
      expect(p.progress.overdueTopics.map((t: { title: string }) => t.title)).toEqual(["T2"]);
      expect(p.progress.reasons.join(" ")).toMatch(/4 h behind the original plan/);
      expect(p.hoursTaught).toBe(5); // 1 + 1.5 + 1 + 1.5
      expect(p.thresholds).toEqual({ onTrack: 1.15, tight: 1 });
    });

    it("uses what-if dates: before the semester everything is future, after it nothing is", async () => {
      const early = await progress(ids.s1, "2026-08-01");
      expect(early.referenceDate).toBe("2026-09-07");
      expect(early.progress.plannedToDateHours).toBe(0);
      const late = await progress(ids.s1, "2027-01-01");
      expect(late.progress).toMatchObject({ availableHours: 0, risk: "DANGER" });
    });
  });

  describe("duplicate prevention and the correction workflow", () => {
    it("refuses a second log for the same scheduled session and points to the existing one", async () => {
      const dup = await faculty(ids.f1)(request(app).post("/api/session-logs")).send(log(ids.wed, "2026-09-16", { covered: [{ topicId: T[1], completionPct: 60 }] }));
      expect(dup.status).toBe(409);
      expect(dup.body).toMatchObject({ error: "duplicate_log", existingLogId: ids.logSep16 });
    });

    it("requires a correction note, versions the log, keeps an audit trail and clears review", async () => {
      expect((await faculty(ids.f1)(request(app).patch(`/api/session-logs/${ids.logSep16}`)).send({ covered: [{ topicId: T[1], completionPct: 60 }] })).status).toBe(400);
      expect((await manager(request(app).post(`/api/session-logs/${ids.logSep16}/review`)).send({ note: "Looks fine" })).body.reviewedAt).toBeTruthy();

      const fixed = await faculty(ids.f1)(request(app).patch(`/api/session-logs/${ids.logSep16}`)).send({ correctionNote: "Typo: it was 60%", covered: [{ topicId: T[1], completionPct: 60 }] });
      expect(fixed.status).toBe(200);
      expect(fixed.body.log).toMatchObject({ revision: 2, reviewedAt: null });
      expect(fixed.body.progress.after.coveredHours).toBe(6.4); // 4 + 0.6 × 4

      const detail = await admin(request(app).get(`/api/session-logs/${ids.logSep16}`));
      expect(detail.body.revisions).toHaveLength(1);
      expect(detail.body.revisions[0]).toMatchObject({ revision: 1, note: "Typo: it was 60%" });
      expect(detail.body.revisions[0].snapshot.covered[0].completionPct).toBe(50); // what it said before

      await faculty(ids.f1)(request(app).patch(`/api/session-logs/${ids.logSep16}`)).send({ correctionNote: "Actually it was 50%", covered: [{ topicId: T[1], completionPct: 50 }] });
      expect((await progress(ids.s1)).progress.coveredHours).toBe(6);
    });
  });

  describe("validation", () => {
    const bad = async (extra: object, entry = ids.mon, date = "2026-09-21") => faculty(ids.f1)(request(app).post("/api/session-logs")).send(log(entry, date, extra));
    const paths = (r: request.Response) => r.body.issues?.map((i: { path: string }) => i.path);

    it("rejects future dates, wrong weekdays and unknown subjects", async () => {
      expect(paths(await bad({ covered: [{ topicId: T[2], completionPct: 10 }] }, ids.mon, "2026-10-12"))).toContain("heldOn");
      expect((await bad({ covered: [{ topicId: T[2], completionPct: 10 }] }, ids.mon, "2026-09-22")).body.issues[0].message).toMatch(/weekday/);
      expect((await faculty(ids.f1)(request(app).post("/api/session-logs")).send(log(ids.mon, "2026-09-21", { subjectId: "nope" }))).status).toBe(400);
    });

    it("rejects incomplete logs: no topics, no cancel reason, bad percentages, unknown topics, lowering a topic", async () => {
      expect(paths(await bad({ outcome: "COMPLETED", covered: [] }))).toContain("covered");
      expect(paths(await bad({ outcome: "CANCELLED", covered: [] }))).toContain("notes");
      expect(paths(await bad({ covered: [{ topicId: T[2], completionPct: 0 }] }))).toContain("covered");
      expect(paths(await bad({ covered: [{ topicId: "ghost", completionPct: 20 }] }))).toContain("covered");
      const lower = await bad({ covered: [{ topicId: T[0], completionPct: 40 }] });
      expect(lower.body.issues[0].message).toMatch(/already at 100%/);
      expect(paths(await bad({ outcome: "CANCELLED", notes: "sick", covered: [{ topicId: T[2], completionPct: 10 }] }))).toContain("covered");
      expect((await request(app).get("/api/progression/subjects/" + ids.s1 + "?asOf=" + REF)).body.progress.coveredHours).toBe(6); // nothing was saved
    });

    it("extra sessions need their length; nothing is written when validation fails", async () => {
      const r = await faculty(ids.f1)(request(app).post("/api/session-logs")).send({ subjectId: ids.s1, heldOn: "2026-09-26", outcome: "COMPLETED", covered: [{ topicId: T[2], completionPct: 10 }] });
      expect(paths(r)).toContain("actualHours");
      expect((await admin(request(app).get(`/api/session-logs?subjectId=${ids.s1}`))).body.logs).toHaveLength(4);
    });
  });

  describe("ownership and review (demo identity — not real security)", () => {
    const body = () => log(ids.mon, "2026-09-21", { covered: [{ topicId: T[2], completionPct: 10 }] });
    it("faculty must say who they are and may only log their own subjects", async () => {
      expect((await request(app).post("/api/session-logs").set("X-Demo-Role", "faculty").send(body())).body.error).toBe("faculty_identity_required");
      const other = await faculty(ids.f2)(request(app).post("/api/session-logs")).send(body());
      expect(other.status).toBe(403);
      expect(other.body.error).toBe("not_your_subject");
      expect((await request(app).post("/api/session-logs").set("X-Demo-Role", "student").send(body())).status).toBe(403);
      expect((await request(app).post("/api/session-logs").send(body())).status).toBe(401);
      expect((await faculty(ids.f2)(request(app).patch(`/api/session-logs/${ids.logSep16}`)).send({ correctionNote: "sneaky", notes: "x" })).status).toBe(403);
    });
    it("faculty only see their own logs; students see none; only managers can review", async () => {
      expect((await faculty(ids.f1)(request(app).get("/api/session-logs"))).body.logs).toHaveLength(4);
      expect((await faculty(ids.f2)(request(app).get("/api/session-logs"))).body.logs).toHaveLength(0);
      expect((await request(app).get("/api/session-logs").set("X-Demo-Role", "student")).status).toBe(403);
      expect((await faculty(ids.f1)(request(app).post(`/api/session-logs/${ids.logSep16}/review`)).send({})).status).toBe(403);
      expect((await manager(request(app).post(`/api/session-logs/${ids.logSep16}/review`)).send({})).status).toBe(200);
    });
  });

  describe("recalculation after timetable, calendar and exam changes (hand-calculated)", () => {
    it("adding a Friday 1 h slot raises capacity to 17.5 h and planned-so-far to 14 h, then removing it restores everything", async () => {
      const fri = await manager(request(app).post("/api/timetable")).send({ subjectId: ids.s1, weekday: 5, startTime: "09:00", endTime: "10:00" });
      const p = (await progress(ids.s1)).progress;
      expect(p).toMatchObject({ availableHours: 17.5, bufferRatio: 1.75, plannedToDateHours: 14, paceHours: -8 });
      await manager(request(app).delete(`/api/timetable/${fri.body.id}`));
      expect((await progress(ids.s1)).progress).toMatchObject({ availableHours: 12.5, bufferRatio: 1.25, plannedToDateHours: 10, paceHours: -4 });
    });
    it("a holiday on Monday 12 Oct removes 1 h: 11.5 / 10 = 1.15 is still ON TRACK; a second one (Wed 14 Oct) makes it TIGHT", async () => {
      const h1 = await manager(request(app).post("/api/calendar/entries")).send({ title: "Holiday", category: "HOLIDAY", startsOn: "2026-10-12", campusId: "rgib" });
      expect((await progress(ids.s1)).progress).toMatchObject({ availableHours: 11.5, bufferRatio: 1.15, risk: "ON_TRACK" });
      const h2 = await manager(request(app).post("/api/calendar/entries")).send({ title: "Holiday 2", category: "HOLIDAY", startsOn: "2026-10-14", campusId: "rgib" });
      expect((await progress(ids.s1)).progress).toMatchObject({ availableHours: 10, bufferRatio: 1, risk: "TIGHT" });
      await manager(request(app).delete(`/api/calendar/entries/${h1.body.id}`));
      await manager(request(app).delete(`/api/calendar/entries/${h2.body.id}`));
      expect((await progress(ids.s1)).progress.availableHours).toBe(12.5);
    });
    it("a mid-term exam week (26–30 Oct) suspends classes: loses Mon 26 Oct 1 h + Wed 28 Oct 1.5 h -> 10 h", async () => {
      const ex = await manager(request(app).post("/api/exams")).send({ name: "Mid-term", type: "MID_TERM", semesterId: ids.sem, startsOn: "2026-10-26", endsOn: "2026-10-30" });
      expect((await progress(ids.s1)).progress).toMatchObject({ availableHours: 10, bufferRatio: 1, risk: "TIGHT" });
      await manager(request(app).delete(`/api/exams/${ex.body.id}`));
      expect((await progress(ids.s1)).progress.availableHours).toBe(12.5);
    });
    it("moving the end-term earlier shortens the window (end-term 19 Oct -> classes end 18 Oct)", async () => {
      const exams = (await request(app).get(`/api/exams?semesterId=${ids.sem}`)).body.exams;
      const endTerm = exams.find((e: { type: string }) => e.type === "END_TERM");
      await manager(request(app).patch(`/api/exams/${endTerm.id}`)).send({ startsOn: "2026-10-19", endsOn: "2026-10-23" });
      // from 5 Oct to 18 Oct: Mon 5, 12 (2 h) + Wed 7, 14 (3 h) = 5 h
      expect((await progress(ids.s1)).progress).toMatchObject({ availableHours: 5, bufferRatio: 0.5, risk: "DANGER" });
      await manager(request(app).patch(`/api/exams/${endTerm.id}`)).send({ startsOn: "2026-11-09", endsOn: "2026-11-13" });
      expect((await progress(ids.s1)).progress.availableHours).toBe(12.5);
    });
    it("the timetable list shows next planned date, logged count and past un-logged sessions", async () => {
      const t = (await request(app).get(`/api/timetable?semesterId=${ids.sem}`)).body.entries;
      const mon = t.find((e: { weekday: number }) => e.weekday === 1);
      expect(mon).toMatchObject({ nextDate: "2026-10-05", loggedCount: 2, pastUnlogged: 2 });
    });
  });

  describe("cancelled, rescheduled and make-up sessions", () => {
    it("a cancelled class counts no teaching and no coverage; a reschedule adds a replacement session", async () => {
      const c = await faculty(ids.f1)(request(app).post("/api/session-logs")).send(log(ids.mon, "2026-09-21", { outcome: "CANCELLED", notes: "Faculty on leave", rescheduledTo: "2026-10-09" }));
      expect(c.status).toBe(201);
      ids.cancelled = c.body.log.id;
      expect(c.body.log).toMatchObject({ outcome: "CANCELLED", hoursTaught: 0, scheduledHours: 1 });
      const p = (await progress(ids.s1)).progress;
      expect(p).toMatchObject({ coveredHours: 6, availableHours: 13.5, bufferRatio: 1.35, plannedToDateHours: 10, paceHours: -4, unloggedPastSessions: 3 });
      expect((await progress(ids.s1)).hoursTaught).toBe(5);
    });
    it("cannot reschedule onto a day that is not a teaching day", async () => {
      const r = await faculty(ids.f1)(request(app).post("/api/session-logs")).send(log(ids.wed, "2026-09-23", { outcome: "CANCELLED", notes: "Strike", rescheduledTo: "2026-10-10" })); // Saturday
      expect(r.body.issues[0]).toMatchObject({ path: "rescheduledTo" });
      expect(r.body.issues[0].message).toMatch(/not a teaching day/);
    });
    it("the make-up appears in that day's schedule, can be logged once (when the day arrives), and then stops counting as future capacity", async () => {
      const sched = await request(app).get("/api/session-logs/schedule?date=2026-10-09&campusId=rgib");
      expect(sched.body.items).toEqual([expect.objectContaining({ kind: "makeup", makeupOfLogId: ids.cancelled, hours: 1, log: null })]);

      expect((await faculty(ids.f1)(request(app).post("/api/session-logs")).send({ subjectId: ids.s1, heldOn: "2026-10-09", makeupOfId: ids.cancelled, outcome: "IN_PROGRESS", covered: [{ topicId: T[2], completionPct: 25 }] })).body.issues[0].message).toMatch(/before it has happened/);
      clock = new Date("2026-10-10T08:00:00Z");
      const made = await faculty(ids.f1)(request(app).post("/api/session-logs")).send({ subjectId: ids.s1, heldOn: "2026-10-09", makeupOfId: ids.cancelled, outcome: "IN_PROGRESS", covered: [{ topicId: T[2], completionPct: 25 }] });
      expect(made.status).toBe(201);
      expect(made.body.log).toMatchObject({ scheduledHours: 1, hoursTaught: 1, timetableEntryId: null });
      const again = await faculty(ids.f1)(request(app).post("/api/session-logs")).send({ subjectId: ids.s1, heldOn: "2026-10-09", makeupOfId: ids.cancelled, outcome: "COMPLETED", covered: [{ topicId: T[2], completionPct: 50 }] });
      expect(again.body.error).toBe("duplicate_log");
      const lock = await faculty(ids.f1)(request(app).patch(`/api/session-logs/${ids.cancelled}`)).send({ correctionNote: "move it", rescheduledTo: "2026-10-14" });
      expect(lock.status).toBe(409);
      expect(lock.body.error).toBe("in_use");
      // as of 10 Oct: T3 25% = 1 h more covered
      expect((await progress(ids.s1, "2026-10-10")).progress).toMatchObject({ coveredHours: 7 });
      clock = new Date("2026-10-05T08:00:00Z");
    });
  });

  describe("merged sessions, skipped topics, campus/batch separation and worst-of roll-ups", () => {
    const J: Record<string, string> = {};
    const jt: Record<string, string[]> = { p: [], q: [] };
    beforeAll(async () => {
      const sem = await admin(request(app).post("/api/semesters")).send({ name: "Sem J", academicYear: "2026-27", track: "UNIVERSITY", campusId: "juj", startsOn: "2026-09-07", endsOn: "2026-12-18", saturdayRule: "NONE" });
      J.sem = sem.body.id;
      await admin(request(app).post(`/api/semesters/${J.sem}/activate`)).send({});
      J.bx = (await manager(request(app).post("/api/batches")).send({ name: "Batch X", semesterId: J.sem })).body.id;
      J.by = (await manager(request(app).post("/api/batches")).send({ name: "Batch Y", semesterId: J.sem })).body.id;
      J.f = (await manager(request(app).post("/api/faculty")).send({ name: "Faculty J", campusId: "juj" })).body.id;
      J.g = (await manager(request(app).post("/api/faculty")).send({ name: "Faculty K", campusId: "juj" })).body.id;
      J.p = (await manager(request(app).post("/api/subjects")).send({ code: "P", name: "Subject P", batchId: J.bx, facultyId: J.f })).body.id;
      J.q = (await manager(request(app).post("/api/subjects")).send({ code: "Q", name: "Subject Q", batchId: J.by, facultyId: J.f })).body.id;
      J.r = (await manager(request(app).post("/api/subjects")).send({ code: "R", name: "Subject R", batchId: J.by, facultyId: J.g })).body.id;
      for (const k of ["p", "q", "r"]) {
        const s = await manager(request(app).put(`/api/subjects/${J[k]}/syllabus`)).send({ units: [{ title: "U", topics: [{ title: "A", plannedHours: 3 }, { title: "B", plannedHours: 3 }, { title: "C", plannedHours: 3 }] }] });
        jt[k === "r" ? "q" : k]!.push(...s.body.units[0].topics.map((t: { id: string }) => t.id));
        J[`${k}Topics`] = s.body.units[0].topics.map((t: { id: string }) => t.id).join(",");
      }
      J.pMon = (await manager(request(app).post("/api/timetable")).send({ subjectId: J.p, weekday: 1, startTime: "09:00", endTime: "10:00" })).body.id;
      J.qMon = (await manager(request(app).post("/api/timetable")).send({ subjectId: J.q, weekday: 1, startTime: "11:00", endTime: "12:00" })).body.id;
      J.rMon = (await manager(request(app).post("/api/timetable")).send({ subjectId: J.r, weekday: 1, startTime: "11:00", endTime: "12:00" })).body.id;
    });
    const topic = (k: string, i: number) => J[`${k}Topics`]!.split(",")[i]!;

    it("a merged class carries zero teaching hours, so one class for two batches is counted once", async () => {
      const primary = await faculty(J.f)(request(app).post("/api/session-logs")).send({ subjectId: J.p, heldOn: "2026-09-07", timetableEntryId: J.pMon, outcome: "COMPLETED", covered: [{ topicId: topic("p", 0), completionPct: 100 }, { topicId: topic("p", 1), completionPct: 50 }] });
      expect(primary.status).toBe(201);
      const merged = await faculty(J.f)(request(app).post("/api/session-logs")).send({ subjectId: J.q, heldOn: "2026-09-07", timetableEntryId: J.qMon, outcome: "MERGED", mergedIntoId: primary.body.log.id, covered: [{ topicId: topic("q", 0), completionPct: 100 }, { topicId: topic("q", 1), completionPct: 50 }] });
      expect(merged.status).toBe(201);
      expect(merged.body.log).toMatchObject({ outcome: "MERGED", hoursTaught: 0, mergedIntoId: primary.body.log.id });
      const hours = (await progress(J.p)).hoursTaught + (await progress(J.q)).hoursTaught;
      expect(hours).toBe(1); // not 2
      // each batch still gets its own coverage: 3 + 1.5 = 4.5 of 9 h = 50%
      expect((await progress(J.q)).progress).toMatchObject({ coveredHours: 4.5, coveragePct: 50 });
      expect((await progress(J.p)).progress).toMatchObject({ coveredHours: 4.5, coveragePct: 50 });
    });

    it("rejects invalid merges: different faculty, different date, or a primary that was cancelled", async () => {
      const primary = (await admin(request(app).get(`/api/session-logs?subjectId=${J.p}`))).body.logs[0];
      const merge = (over: object) => admin(request(app).post("/api/session-logs")).send({ subjectId: J.r, heldOn: "2026-09-07", timetableEntryId: J.rMon, outcome: "MERGED", mergedIntoId: primary.id, covered: [{ topicId: topic("r", 0), completionPct: 10 }], ...over });
      expect((await merge({})).body.issues[0].message).toMatch(/same faculty member/); // R is taught by a different teacher
      expect((await merge({ heldOn: "2026-09-14", mergedIntoId: primary.id })).body.issues.map((i: { message: string }) => i.message).join(" ")).toMatch(/same date/);
      const cancelled = await faculty(J.f)(request(app).post("/api/session-logs")).send({ subjectId: J.p, heldOn: "2026-09-14", timetableEntryId: J.pMon, outcome: "CANCELLED", notes: "Holiday trip" });
      const toCancelled = await admin(request(app).post("/api/session-logs")).send({ subjectId: J.q, heldOn: "2026-09-14", timetableEntryId: J.qMon, outcome: "MERGED", mergedIntoId: cancelled.body.log.id, covered: [{ topicId: topic("q", 2), completionPct: 10 }] });
      expect(toCancelled.body.issues[0].message).toMatch(/primary session must itself be/);
      expect((await admin(request(app).get(`/api/session-logs?subjectId=${J.q}`))).body.logs).toHaveLength(1);
    });

    it("a topic marked Skipped leaves scope (with its coverage) and can be restored by covering it again", async () => {
      // P: topic B was 50% (1.5 h). Skipping it removes 3 h from scope and its 1.5 h from covered: 3 / 6 h = 50%
      const sk = await faculty(J.f)(request(app).post("/api/session-logs")).send({ subjectId: J.p, heldOn: "2026-09-21", outcome: "COMPLETED", actualHours: 1, notes: "Dropped topic B from the syllabus", covered: [{ topicId: topic("p", 2), completionPct: 1 }], skipped: [topic("p", 1)] });
      expect(sk.status).toBe(201);
      const p = (await progress(J.p)).progress;
      expect(p).toMatchObject({ hoursInScope: 6, coveredHours: 3.03, remainingHours: 2.97 });
      expect(p.topics.find((t: { title: string }) => t.title === "B").status).toBe("skipped");
    });

    it("keeps campuses separate and rolls up to the WORST subject at batch, track and campus level", async () => {
      const juj = (await request(app).get(`/api/progression?campusId=juj&asOf=${REF}`)).body;
      const rgib = (await request(app).get(`/api/progression?campusId=rgib&asOf=${REF}`)).body;
      expect(juj.subjects.map((s: { code: string }) => s.code).sort()).toEqual(["P", "Q", "R"]);
      expect(rgib.subjects.map((s: { code: string }) => s.code)).toEqual(["S1"]);
      expect(rgib.overall).toBe("ON_TRACK");
      // batch Y has Q (50% covered) and R (nothing covered, same capacity): the batch takes the worse of the two
      const statusOf = (code: string) => juj.subjects.find((s: { code: string }) => s.code === code).risk;
      const batchY = juj.byBatch.find((b: { batchName: string }) => b.batchName === "Batch Y");
      const order = ["DANGER", "TIGHT", "UNKNOWN", "ON_TRACK", "COMPLETE"];
      const worst = [statusOf("Q"), statusOf("R")].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
      expect(batchY.status).toBe(worst);
      expect(juj.overall).toBe(juj.subjects.map((s: { risk: string }) => s.risk).sort((a: string, b: string) => order.indexOf(a) - order.indexOf(b))[0]);
      expect(juj.byTrack).toEqual([expect.objectContaining({ track: "UNIVERSITY" })]);
    });

    it("filters progression by batch and semester", async () => {
      const x = (await request(app).get(`/api/progression?campusId=juj&batchId=${J.bx}&asOf=${REF}`)).body;
      expect(x.subjects.map((s: { code: string }) => s.code)).toEqual(["P"]);
      const wrongCampus = await request(app).get(`/api/progression?campusId=rgib&semesterId=${J.sem}`);
      expect(wrongCampus.status).toBe(404);
    });
  });

  describe("dashboard and syllabus safety", () => {
    it("the dashboard is live for a campus with data, and demo only for a campus without", async () => {
      const live = (await request(app).get("/api/dashboard?campusId=rgib")).body;
      expect(live.dataSource).toBe("live");
      expect(live.context.today).toBe("2026-10-05");
      expect(live.overall.status).toBe("ON_TRACK");
      expect(live.metrics).toMatchObject({ overallCoveragePct: 37.5 });
      const demo = (await request(app).get("/api/dashboard?campusId=ratnam")).body;
      expect(demo.dataSource).toBe("demo");
    });
    it("live at-risk rows carry the explanation, today's schedule shows log state", async () => {
      const live = (await request(app).get("/api/dashboard?campusId=juj")).body;
      for (const row of live.atRisk) expect(row.reason).toBeTruthy();
      expect(live.schedule.every((s: { state: string }) => ["logged", "needs_log", "upcoming"].includes(s.state))).toBe(true);
      expect(live.recentSessions.length).toBeGreaterThan(0);
    });
    it("topics that already have session history cannot be deleted from the syllabus", async () => {
      const current = (await request(app).get(`/api/subjects/${ids.s1}/syllabus`)).body.units;
      const without = current.map((u: { id: string; title: string; topics: Array<{ id: string; title: string; plannedHours: number }> }) => ({ ...u, topics: u.topics.filter((t) => t.title !== "T1") }));
      const res = await manager(request(app).put(`/api/subjects/${ids.s1}/syllabus`)).send({ units: without });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Mark them as Skipped/);
      // topics with no history can still be removed, and reordering keeps working
      const t4 = current[1].topics.find((t: { title: string }) => t.title === "T4");
      const ok = await manager(request(app).put(`/api/subjects/${ids.s1}/syllabus`)).send({ units: current.map((u: { topics: Array<{ id: string }> }) => ({ ...u, topics: u.topics.filter((t) => t.id !== t4.id) })) });
      expect(ok.status).toBe(200);
    });
  });
});
