/**
 * Integration tests against a REAL PostgreSQL (TEST_DATABASE_URL). They migrate the test database, wipe the academic
 * tables, then drive the HTTP API end to end. Skipped when TEST_DATABASE_URL is not set.
 *   npm run db:embedded   (or docker compose)  then  npm run test:integration
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDatabase, type Database } from "./db/client.js";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("academic setup API (PostgreSQL)", () => {
  let db: Database;
  let app: ReturnType<typeof createApp>;
  const as = (role: string, t: request.Test) => t.set("X-Demo-Role", role);
  const admin = (t: request.Test) => as("admin", t);
  const manager = (t: request.Test) => as("campus_manager", t);

  const ids: Record<string, string> = {};

  beforeAll(async () => {
    execSync("npx prisma migrate deploy", { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    db = createDatabase(url);
    await db.prisma!.$executeRawUnsafe(`TRUNCATE "SessionTopicEntry","SessionLogRevision","SessionLog","Exam","CalendarEntry","TimetableEntry","SyllabusTopic","SyllabusUnit","Subject","Batch","Faculty","Semester" RESTART IDENTITY CASCADE`);
    app = createApp({ CORS_ORIGIN: "http://localhost:5173" }, db, () => new Date("2026-10-16T08:00:00Z"));
  });
  afterAll(async () => { await db?.close(); });

  const sem = { name: "Semester 3", academicYear: "2026-27", track: "MIRAI", campusId: "hi-tech", startsOn: "2026-08-03", endsOn: "2026-12-18", saturdayRule: "SECOND_FOURTH" };

  describe("semesters", () => {
    it("creates, lists with derived status, and refuses silent duplicates", async () => {
      const created = await admin(request(app).post("/api/semesters")).send(sem);
      expect(created.status).toBe(201);
      ids.sem = created.body.id;
      expect(created.body).toMatchObject({ status: "upcoming", isActive: false }); // in window but not activated

      const dup = await admin(request(app).post("/api/semesters")).send({ ...sem, startsOn: "2027-01-04", endsOn: "2027-05-28" });
      expect(dup.status).toBe(409);
      expect(dup.body.error).toBe("duplicate");

      const list = await request(app).get("/api/semesters?campusId=hi-tech");
      expect(list.body.semesters).toHaveLength(1);
    });

    it("warns about overlaps and only proceeds when confirmed", async () => {
      const body = { ...sem, name: "Semester 3b", startsOn: "2026-12-01", endsOn: "2027-04-01" };
      const warn = await admin(request(app).post("/api/semesters")).send(body);
      expect(warn.status).toBe(409);
      expect(warn.body.error).toBe("needs_confirmation");
      expect(warn.body.warnings[0].code).toBe("semester_overlap");
      expect((await request(app).get("/api/semesters?campusId=hi-tech")).body.semesters).toHaveLength(1); // nothing was written

      const ok = await admin(request(app).post("/api/semesters")).send({ ...body, confirmOverlap: true });
      expect(ok.status).toBe(201);
      ids.sem2 = ok.body.id;
      // other track with identical dates does not warn
      expect((await admin(request(app).post("/api/semesters")).send({ ...sem, track: "UNIVERSITY" })).status).toBe(201);
    });

    it("activates one semester per campus+track, asking before deactivating another", async () => {
      expect((await admin(request(app).post(`/api/semesters/${ids.sem}/activate`)).send({})).status).toBe(200);
      const clash = await admin(request(app).post(`/api/semesters/${ids.sem2}/activate`)).send({});
      expect(clash.status).toBe(409);
      expect(clash.body.warnings[0].message).toMatch(/will deactivate "Semester 3"/);
      const done = await admin(request(app).post(`/api/semesters/${ids.sem2}/activate`)).send({ confirm: true });
      expect(done.body.deactivated).toEqual(["Semester 3"]);
      const list = (await request(app).get("/api/semesters?campusId=hi-tech&track=MIRAI")).body.semesters;
      expect(list.filter((s: { isActive: boolean }) => s.isActive)).toHaveLength(1);
      await admin(request(app).post(`/api/semesters/${ids.sem}/activate`)).send({ confirm: true });
    });

    it("validates edits against the merged record", async () => {
      const res = await admin(request(app).patch(`/api/semesters/${ids.sem}`)).send({ endsOn: "2026-07-01" });
      expect(res.status).toBe(400);
      expect(res.body.issues[0].path).toBe("endsOn");
      expect((await admin(request(app).patch("/api/semesters/nope")).send({ name: "x" })).status).toBe(404);
    });
  });

  describe("batches, faculty, subjects", () => {
    it("creates batches and faculty, enforcing campus consistency", async () => {
      const b = await manager(request(app).post("/api/batches")).send({ name: "Mirai Batch A", semesterId: ids.sem, studentCount: 40 });
      expect(b.status).toBe(201);
      expect(b.body).toMatchObject({ campusId: "hi-tech", track: "MIRAI", semesterName: "Semester 3" }); // derived from the semester
      ids.batchA = b.body.id;
      ids.batchB = (await manager(request(app).post("/api/batches")).send({ name: "Mirai Batch B", semesterId: ids.sem })).body.id;
      expect((await manager(request(app).post("/api/batches")).send({ name: "Mirai Batch A", semesterId: ids.sem })).status).toBe(409);

      ids.fac = (await manager(request(app).post("/api/faculty")).send({ name: "Faculty One", campusId: "hi-tech", email: "one@example.test" })).body.id;
      ids.facOther = (await manager(request(app).post("/api/faculty")).send({ name: "Faculty Elsewhere", campusId: "juj" })).body.id;
      expect((await manager(request(app).post("/api/faculty")).send({ name: "Dup", campusId: "hi-tech", email: "one@example.test" })).status).toBe(409);
    });

    it("rejects faculty from another campus and duplicate subject codes in a batch", async () => {
      const wrong = await manager(request(app).post("/api/subjects")).send({ code: "X1", name: "X", batchId: ids.batchA, facultyId: ids.facOther });
      expect(wrong.status).toBe(400);
      expect(wrong.body.issues[0].message).toMatch(/different campus/);

      const s1 = await manager(request(app).post("/api/subjects")).send({ code: "S1", name: "Subject One", batchId: ids.batchA, facultyId: ids.fac, plannedHours: 45 });
      expect(s1.status).toBe(201);
      ids.s1 = s1.body.id;
      expect(s1.body.weeklyScheduledHours).toBe(0);
      expect((await manager(request(app).post("/api/subjects")).send({ code: "S1", name: "Again", batchId: ids.batchA })).status).toBe(409);
      ids.s2 = (await manager(request(app).post("/api/subjects")).send({ code: "S2", name: "Subject Two", batchId: ids.batchB, facultyId: ids.fac })).body.id;
    });
  });

  describe("timetable", () => {
    const slot = (subjectId: string | undefined, over: object = {}) => ({ subjectId, weekday: 1, startTime: "09:00", endTime: "10:00", room: "R1", ...over });

    it("accepts a valid slot and derives hours without storing them", async () => {
      const res = await manager(request(app).post("/api/timetable")).send(slot(ids.s1));
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ hours: 1, batchName: "Mirai Batch A", facultyName: "Faculty One" });
      ids.tt1 = res.body.id;
      await manager(request(app).post("/api/timetable")).send(slot(ids.s1, { weekday: 3, endTime: "10:30" }));
      const subj = (await request(app).get(`/api/subjects?batchId=${ids.batchA}`)).body.subjects[0];
      expect(subj.weeklyScheduledHours).toBe(2.5);
      // Oct–Dec 2026 etc.: projection covers the whole semester and respects holidays/Saturday rules
      expect(subj.projectedSemesterHours).toBeGreaterThan(40);
    });

    it("reports faculty conflicts with a readable message (different batch, same teacher)", async () => {
      const res = await manager(request(app).post("/api/timetable")).send(slot(ids.s2, { startTime: "09:30", endTime: "10:30" }));
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("timetable_conflict");
      expect(res.body.conflicts).toEqual([expect.objectContaining({ type: "faculty", message: "Faculty One already teaches Subject One to Mirai Batch A on Monday 09:00–10:00." })]);
    });

    it("reports batch conflicts (same batch, no faculty needed) and allows back-to-back classes", async () => {
      ids.s3 = (await manager(request(app).post("/api/subjects")).send({ code: "S3", name: "Subject Three", batchId: ids.batchA })).body.id;
      const clash = await manager(request(app).post("/api/timetable")).send(slot(ids.s3, { startTime: "09:45", endTime: "10:45" }));
      expect(clash.body.conflicts.map((c: { type: string }) => c.type)).toEqual(["batch"]);
      expect((await manager(request(app).post("/api/timetable")).send(slot(ids.s3, { startTime: "10:00", endTime: "11:00" }))).status).toBe(201);
    });

    it("rechecks on edit and on re-assignment", async () => {
      const edit = await manager(request(app).patch(`/api/timetable/${ids.tt1}`)).send({ startTime: "10:00", endTime: "10:30" });
      expect(edit.status).toBe(409); // now overlaps Subject Three for the same batch
      // Subject Four (Batch B, no teacher yet) meets Mon 09:00-10:00, exactly when Faculty One teaches Subject One.
      ids.s4 = (await manager(request(app).post("/api/subjects")).send({ code: "S4", name: "Subject Four", batchId: ids.batchB })).body.id;
      expect((await manager(request(app).post("/api/timetable")).send(slot(ids.s4))).status).toBe(201);
      const reassign = await manager(request(app).patch(`/api/subjects/${ids.s4}`)).send({ facultyId: ids.fac });
      expect(reassign.status).toBe(409);
      expect(reassign.body.conflicts[0].type).toBe("faculty");
      expect((await manager(request(app).patch(`/api/timetable/${ids.tt1}`)).send({ startTime: "11:00", endTime: "10:00" })).status).toBe(400);
    });

    it("exports the timetable as CSV", async () => {
      const csv = await request(app).get(`/api/timetable/export.csv?semesterId=${ids.sem}`);
      expect(csv.headers["content-type"]).toMatch(/text\/csv/);
      expect(csv.text.split("\r\n")[0]).toBe("batch,subject_code,subject,faculty,weekday,start_time,end_time,room,hours,sample_data");
      expect(csv.text).toContain("Mirai Batch A,S1,Subject One,Faculty One,Monday,09:00,10:00,R1,1,no");
    });
  });

  describe("calendar", () => {
    const month = (m: string) => request(app).get(`/api/calendar/month?campusId=hi-tech&track=MIRAI&month=${m}`);

    it("applies the semester's Saturday rule and shows holidays / special working days", async () => {
      const hol = await manager(request(app).post("/api/calendar/entries")).send({ title: "Gandhi Jayanti", category: "HOLIDAY", startsOn: "2026-10-02" });
      expect(hol.status).toBe(201);
      await manager(request(app).post("/api/calendar/entries")).send({ title: "Make-up Saturday", category: "SPECIAL_WORKING_DAY", startsOn: "2026-10-31", campusId: "hi-tech" });
      await manager(request(app).post("/api/calendar/entries")).send({ title: "Other campus fest", category: "EVENT", startsOn: "2026-10-14", campusId: "juj" });
      ids.holiday = hol.body.id;

      const res = await month("2026-10");
      expect(res.body.ruleSource).toBe("semester");
      expect(res.body.saturdayRule).toBe("SECOND_FOURTH");
      const day = (d: string) => res.body.days.find((x: { date: string }) => x.date === d);
      expect(day("2026-10-02")).toMatchObject({ working: false, reason: "holiday" });
      expect(day("2026-10-10")).toMatchObject({ working: true, reason: "saturday_working" });
      expect(day("2026-10-17")).toMatchObject({ working: false, reason: "saturday_off" });
      expect(day("2026-10-31")).toMatchObject({ working: true, reason: "special_working_day" });
      expect(day("2026-10-18")).toMatchObject({ working: false, reason: "sunday" });
      expect(res.body.entries.map((e: { title: string }) => e.title)).not.toContain("Other campus fest"); // campus scoping
    });

    it("falls back to a documented default rule when no semester covers the month", async () => {
      const res = await month("2030-01");
      expect(res.body.ruleSource).toBe("default");
      expect(res.body.semester).toBeNull();
    });

    it("edits and deletes entries; special working days stay permission-gated", async () => {
      const upd = await manager(request(app).patch(`/api/calendar/entries/${ids.holiday}`)).send({ endsOn: "2026-10-03" });
      expect(upd.body.endsOn).toBe("2026-10-03");
      expect((await manager(request(app).patch(`/api/calendar/entries/${ids.holiday}`)).send({ endsOn: "2026-09-01" })).status).toBe(400);
      const sp = (await month("2026-10")).body.entries.find((e: { category: string }) => e.category === "SPECIAL_WORKING_DAY");
      expect((await as("faculty", request(app).delete(`/api/calendar/entries/${sp.id}`))).status).toBe(403);
      expect((await manager(request(app).delete(`/api/calendar/entries/${sp.id}`))).status).toBe(204);
    });

    it("exports CSV with formula-safe cells", async () => {
      await manager(request(app).post("/api/calendar/entries")).send({ title: "=HYPERLINK(1)", category: "EVENT", startsOn: "2026-11-02" });
      const csv = await request(app).get("/api/calendar/export.csv?campusId=hi-tech");
      expect(csv.text).toContain("'=HYPERLINK(1)");
    });
  });

  describe("exams", () => {
    const exam = (over: object = {}) => ({ name: "Mid-term", type: "MID_TERM", semesterId: ids.sem, startsOn: "2026-10-26", endsOn: "2026-10-30", ...over });

    it("validates dates against the semester and creates exams with derived campus/track", async () => {
      expect((await manager(request(app).post("/api/exams")).send(exam({ startsOn: "2026-10-30", endsOn: "2026-10-26" }))).status).toBe(400);
      const out = await manager(request(app).post("/api/exams")).send(exam({ startsOn: "2026-12-10", endsOn: "2026-12-30" }));
      expect(out.body.issues[0].message).toMatch(/within the semester/);
      const ok = await manager(request(app).post("/api/exams")).send(exam());
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ campusId: "hi-tech", track: "MIRAI", typeLabel: "Mid-term" });
      ids.exam = ok.body.id;
    });

    it("warns on overlaps, honouring batch scope", async () => {
      const warn = await manager(request(app).post("/api/exams")).send(exam({ name: "PUT", type: "PUT", startsOn: "2026-10-30", endsOn: "2026-11-02" }));
      expect(warn.status).toBe(409);
      expect(warn.body.warnings[0].code).toBe("exam_overlap");
      expect((await manager(request(app).post("/api/exams")).send(exam({ name: "PUT", type: "PUT", startsOn: "2026-10-30", endsOn: "2026-11-02", confirmOverlap: true }))).status).toBe(201);
      // a batch from another semester is rejected
      const bad = await manager(request(app).post("/api/exams")).send(exam({ batchId: "does-not-exist", startsOn: "2026-11-10", endsOn: "2026-11-11" }));
      expect(bad.status).toBe(400);
    });

    it("lists exams on the calendar for the same campus and track only", async () => {
      const cal = await request(app).get("/api/calendar/month?campusId=hi-tech&track=MIRAI&month=2026-10");
      expect(cal.body.exams.map((e: { name: string }) => e.name)).toContain("Mid-term");
      const other = await request(app).get("/api/calendar/month?campusId=juj&track=MIRAI&month=2026-10");
      expect(other.body.exams).toEqual([]);
    });
  });

  describe("syllabus", () => {
    const body = (extra: object[] = []) => ({ units: [{ title: "Unit A", topics: [{ title: "A1", plannedHours: 2, examScope: "SESSIONAL" }, { title: "A2", plannedHours: 3 }] }, { title: "Unit B", topics: [{ title: "B1", plannedHours: 4, examScope: "END_TERM" }] }, ...extra] });

    it("saves ordered units and topics and keeps ids stable across reorders", async () => {
      const saved = await manager(request(app).put(`/api/subjects/${ids.s1}/syllabus`)).send(body());
      expect(saved.status).toBe(200);
      expect(saved.body.totalPlannedHours).toBe(9);
      const [a, b] = saved.body.units;
      // reorder: units swapped, A's topics swapped, a topic removed, one added
      const re = await manager(request(app).put(`/api/subjects/${ids.s1}/syllabus`)).send({
        units: [
          { id: b.id, title: "Unit B", topics: [{ id: b.topics[0].id, title: "B1", plannedHours: 4, examScope: "END_TERM" }, { title: "B2 new", plannedHours: 1 }] },
          { id: a.id, title: "Unit A", topics: [{ id: a.topics[1].id, title: "A2", plannedHours: 3 }] },
        ],
      });
      expect(re.body.units.map((u: { title: string }) => u.title)).toEqual(["Unit B", "Unit A"]);
      expect(re.body.units[0].topics[0].id).toBe(b.topics[0].id); // identity preserved
      expect(re.body.units[1].topics.map((t: { title: string }) => t.title)).toEqual(["A2"]); // A1 removed
      expect(re.body.totalPlannedHours).toBe(8);
    });

    it("rejects ids that belong to another subject", async () => {
      const other = (await request(app).get(`/api/subjects/${ids.s1}/syllabus`)).body.units[0];
      const res = await manager(request(app).put(`/api/subjects/${ids.s2}/syllabus`)).send({ units: [{ id: other.id, title: "Stolen", topics: [] }] });
      expect(res.status).toBe(400);
    });

    it("previews imports with row-level errors and refuses to commit invalid files", async () => {
      const csv = "unit,topic,planned_hours,exam_scope\nImp,Ok,2,PUT\nImp,Bad,zero,\n,NoUnit,1,\nImp,Scope,1,NOPE\n";
      const prev = await manager(request(app).post(`/api/subjects/${ids.s1}/syllabus/import/preview`)).send({ csv });
      expect(prev.body.valid).toBe(false);
      expect(prev.body.errors.map((e: { row: number; field: string }) => `${e.row}:${e.field}`)).toEqual(["3:planned_hours", "4:unit", "5:exam_scope"]);
      expect(prev.body.existingTopicCount).toBe(3);
      const commit = await manager(request(app).post(`/api/subjects/${ids.s1}/syllabus/import`)).send({ csv, confirmReplace: true });
      expect(commit.status).toBe(400);
      expect(commit.body.error).toBe("import_invalid");
      expect((await request(app).get(`/api/subjects/${ids.s1}/syllabus`)).body.totalPlannedHours).toBe(8); // untouched
    });

    it("requires confirmation before replacing, then imports and exports round-trip", async () => {
      const csv = "unit,topic,planned_hours,exam_scope\nUnit B,B1,4,END_TERM\nUnit C,C1,5,mid-term\n";
      const before = (await request(app).get(`/api/subjects/${ids.s1}/syllabus`)).body.units.find((u: { title: string }) => u.title === "Unit B").topics[0].id;
      const ask = await manager(request(app).post(`/api/subjects/${ids.s1}/syllabus/import`)).send({ csv });
      expect(ask.status).toBe(409);
      expect(ask.body.warnings[0].code).toBe("will_replace_syllabus");
      const done = await manager(request(app).post(`/api/subjects/${ids.s1}/syllabus/import`)).send({ csv, confirmReplace: true });
      expect(done.status).toBe(200);
      expect(done.body.units.map((u: { title: string }) => u.title)).toEqual(["Unit B", "Unit C"]);
      expect(done.body.units[0].topics[0].id).toBe(before); // matched by title: identity kept
      const out = await request(app).get(`/api/subjects/${ids.s1}/syllabus/export.csv`);
      expect(out.text).toBe("unit,topic,planned_hours,exam_scope\r\nUnit B,B1,4,END_TERM\r\nUnit C,C1,5,MID_TERM\r\n");
    });

    it("shows syllabus hours next to planned hours on the subject list", async () => {
      const s = (await request(app).get(`/api/subjects?batchId=${ids.batchA}`)).body.subjects.find((x: { code: string }) => x.code === "S1");
      expect(s).toMatchObject({ plannedHours: 45, syllabusPlannedHours: 9, topicCount: 2 });
    });
  });

  describe("safe deletion", () => {
    it("blocks deleting things that other data depends on, and says why", async () => {
      expect((await manager(request(app).delete(`/api/faculty/${ids.fac}`))).body.message).toMatch(/assigned to \d+ subject/);
      expect((await manager(request(app).delete(`/api/batches/${ids.batchA}`))).status).toBe(409);
      const semDel = await admin(request(app).delete(`/api/semesters/${ids.sem}`));
      expect(semDel.status).toBe(409);
      expect(semDel.body.blockers.batches).toBe(2);
      expect((await as("faculty", request(app).delete(`/api/batches/${ids.batchA}`))).status).toBe(403);
    });

    it("asks before cascading a subject's timetable and syllabus, then cleans up", async () => {
      const ask = await manager(request(app).delete(`/api/subjects/${ids.s1}`));
      expect(ask.status).toBe(409);
      expect(ask.body.warnings[0].message).toMatch(/also deletes its 2 syllabus unit\(s\) and 2 timetable entries/);
      expect((await manager(request(app).delete(`/api/subjects/${ids.s1}?confirm=true`))).status).toBe(204);
      expect((await request(app).get(`/api/timetable?batchId=${ids.batchA}`)).body.entries.map((e: { subjectCode: string }) => e.subjectCode)).toEqual(["S3"]);
      for (const k of ["s2", "s3", "s4"]) await manager(request(app).delete(`/api/subjects/${ids[k]}?confirm=true`));
      expect((await manager(request(app).delete(`/api/faculty/${ids.fac}`))).status).toBe(204);
    });
  });

  it("keeps Phase 1 endpoints working alongside the database", async () => {
    expect((await request(app).get("/api/health")).body).toMatchObject({ status: "ok", database: { state: "connected" } });
    expect((await request(app).get("/api/dashboard?campusId=ratnam")).body.dataSource).toBe("demo");
  });
});
