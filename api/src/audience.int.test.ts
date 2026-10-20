/**
 * Faculty- and student-level (assignment / batch) isolation inside ONE campus (real PostgreSQL, production-mode app).
 * Campus RGIB, semester "Sem": two batches, three subjects —
 *   ONE-SUBJ   batch ONE-BATCH   faculty ONE-FAC      Monday 09:00
 *   THREE-SUBJ batch ONE-BATCH   faculty TWO-FAC      Wednesday 09:00   (TWO-FAC teaches in BOTH batches)
 *   TWO-SUBJ   batch TWO-BATCH   faculty TWO-FAC      Tuesday 09:00
 * Exams: COHORT-EXAM (whole semester), ONE-EXAM (batch ONE only), TWO-EXAM (batch TWO only).
 * Who may see what:  ONE-FAC: ONE-SUBJ only.  TWO-FAC: THREE-SUBJ + TWO-SUBJ.  Student ONE: ONE-SUBJ + THREE-SUBJ.  Student TWO: TWO-SUBJ.
 * Campus managers and admins keep the whole campus.
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

suite("faculty and student audience isolation (PostgreSQL)", () => {
  let db: Database;
  let prod: ReturnType<typeof createApp>;
  let dev: ReturnType<typeof createApp>;
  const clock = new Date("2026-10-05T08:00:00Z");
  const ids: Record<string, string> = {};
  const cookies: Record<string, string> = {};
  const admin = (t: request.Test) => t.set("X-Demo-Role", "admin");
  const call = (who: string, method: "get" | "post" | "patch" | "put" | "delete", path: string, body?: object) => {
    const t = who === "anon" ? request(prod)[method](path) : request(prod)[method](path).set("Cookie", cookies[who]!);
    return body === undefined ? t : t.send(body);
  };
  const text = (res: request.Response) => JSON.stringify(res.body) + (res.text ?? "");

  // what each actor must never see anywhere (response bodies and CSV exports)
  const forbidden: Record<string, string[]> = {
    facOne: ["TWO-SUBJ", "THREE-SUBJ", "TWO-BATCH", "TWO-FAC", "TWO-EXAM", "ONE-EXAM-NOT", "TWO-TOPIC", "THREE-TOPIC", "TWO-NOTE", "THREE-NOTE"],
    facTwo: ["ONE-SUBJ", "ONE-FAC", "ONE-TOPIC", "ONE-NOTE"],
    stuOne: ["TWO-SUBJ", "TWO-BATCH", "TWO-EXAM", "TWO-TOPIC", "TWO-NOTE"],
    stuTwo: ["ONE-SUBJ", "THREE-SUBJ", "ONE-BATCH", "ONE-FAC", "ONE-EXAM", "ONE-TOPIC", "THREE-TOPIC", "ONE-NOTE", "THREE-NOTE"],
  };

  beforeAll(async () => {
    execSync("npx prisma migrate deploy", { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    db = createDatabase(url);
    await db.prisma!.$executeRawUnsafe(`TRUNCATE "SessionTopicEntry","SessionLogRevision","SessionLog","Exam","CalendarEntry","TimetableEntry","SyllabusTopic","SyllabusUnit","Subject","Batch","Faculty","Semester" RESTART IDENTITY CASCADE`);
    const setup = createApp({ CORS_ORIGIN: "http://localhost:5173", DEMO_DEFAULT_CAMPUS: "*" }, db, () => clock);
    dev = createApp({ CORS_ORIGIN: "http://localhost:5173", DEMO_DEFAULT_CAMPUS: "rgib" }, db, () => clock);
    const post = async (path: string, body: object) => { const r = await admin(request(setup).post(path)).send(body); if (r.status >= 300) throw new Error(`${path} -> ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
    ids.sem = (await post("/api/semesters", { name: "Sem", academicYear: "2026-27", track: "MIRAI", campusId: "rgib", startsOn: "2026-09-07", endsOn: "2026-12-18", saturdayRule: "NONE" })).id;
    await admin(request(setup).post(`/api/semesters/${ids.sem}/activate`)).send({});
    ids.b1 = (await post("/api/batches", { name: "ONE-BATCH", semesterId: ids.sem })).id;
    ids.b2 = (await post("/api/batches", { name: "TWO-BATCH", semesterId: ids.sem })).id;
    ids.f1 = (await post("/api/faculty", { name: "ONE-FAC", campusId: "rgib" })).id;
    ids.f2 = (await post("/api/faculty", { name: "TWO-FAC", campusId: "rgib" })).id;
    const subs: Array<[string, string, string, string, string, number]> = [["s1", "ONE-SUBJ", "b1", "f1", "ONE", 1], ["s3", "THREE-SUBJ", "b1", "f2", "THREE", 3], ["s2", "TWO-SUBJ", "b2", "f2", "TWO", 2]];
    for (const [k, name, b, f, tag, weekday] of subs) {
      ids[k] = (await post("/api/subjects", { code: name.slice(0, 3), name, batchId: ids[b!], facultyId: ids[f!] })).id;
      const syl = await admin(request(setup).put(`/api/subjects/${ids[k]}/syllabus`)).send({ units: [{ title: `${tag}-UNIT`, topics: [{ title: `${tag}-TOPIC`, plannedHours: 4 }] }] });
      ids[`${k}t`] = syl.body.units[0].topics[0].id;
      ids[`${k}slot`] = (await post("/api/timetable", { subjectId: ids[k], weekday, startTime: "09:00", endTime: "10:00" })).id;
      const date = weekday === 1 ? "2026-09-07" : weekday === 2 ? "2026-09-08" : "2026-09-09";
      ids[`${k}log`] = (await post("/api/session-logs", { subjectId: ids[k], heldOn: date, timetableEntryId: ids[`${k}slot`], outcome: "COMPLETED", covered: [{ topicId: ids[`${k}t`], completionPct: 100 }], notes: `${tag}-NOTE` })).log.id;
    }
    await post("/api/exams", { name: "COHORT-EXAM", type: "MID_TERM", semesterId: ids.sem, startsOn: "2026-10-26", endsOn: "2026-10-30" });
    await post("/api/exams", { name: "ONE-EXAM", type: "SESSIONAL", semesterId: ids.sem, batchId: ids.b1, startsOn: "2026-11-16", endsOn: "2026-11-17" });
    await post("/api/exams", { name: "TWO-EXAM", type: "SESSIONAL", semesterId: ids.sem, batchId: ids.b2, startsOn: "2026-11-23", endsOn: "2026-11-24" });

    const pw = (w: string) => `${w}-passphrase-123`;
    const accounts = [
      { email: "admin", role: "admin" }, { email: "adminA", role: "admin", campusIds: ["rgib"] }, { email: "mgr", role: "campus_manager", campusIds: ["rgib"] },
      { email: "facOne", role: "faculty", facultyId: ids.f1 }, { email: "facTwo", role: "faculty", facultyId: ids.f2 },
      { email: "stuOne", role: "student", batchId: ids.b1 }, { email: "stuTwo", role: "student", batchId: ids.b2 },
    ].map((a) => ({ ...a, email: `${a.email}@t.test`, passwordHash: hashPassword(pw(a.email)) }));
    prod = createApp({ CORS_ORIGIN: "http://localhost:5173", NODE_ENV: "production", ALLOW_DEMO_HEADERS: false, AUTH_USERS: JSON.stringify(accounts), SESSION_SECRET: "s".repeat(40) } as never, db, () => clock);
    for (const a of accounts) { const w = a.email.replace("@t.test", ""); cookies[w] = String((await request(prod).post("/api/auth/login").send({ email: a.email, password: pw(w) })).headers["set-cookie"]?.[0]).split(";")[0]!; }
  });
  afterAll(async () => { await db?.close(); });

  const reads = (): string[] => [
    "/api/subjects", `/api/subjects?batchId=${ids.b1}`, `/api/subjects?batchId=${ids.b2}`, `/api/subjects?facultyId=${ids.f1}`, `/api/subjects?facultyId=${ids.f2}`, "/api/batches", "/api/faculty", "/api/semesters", "/api/exams", "/api/timetable", `/api/timetable?batchId=${ids.b2}`,
    `/api/subjects/export.csv?semesterId=${ids.sem}`, `/api/timetable/export.csv?semesterId=${ids.sem}`, "/api/exams/export.csv",
    "/api/progression?campusId=rgib", "/api/exam-readiness?campusId=rgib", "/api/calendar/month?campusId=rgib&track=MIRAI&month=2026-10", "/api/calendar/month?campusId=rgib&track=MIRAI&month=2026-11", "/api/dashboard?campusId=rgib",
    "/api/session-logs/schedule?date=2026-10-05&campusId=rgib", "/api/session-logs/schedule?date=2026-10-06&campusId=rgib", "/api/session-logs/schedule?date=2026-10-07&campusId=rgib",
    `/api/session-logs/schedule?date=2026-10-06&campusId=rgib&facultyId=${ids.f2}`, "/api/session-logs/pending?campusId=rgib&days=30", `/api/session-logs/pending?campusId=rgib&days=30&facultyId=${ids.f2}`,
    "/api/session-logs", `/api/session-logs?subjectId=${ids.s2}`, `/api/session-logs?batchId=${ids.b2}`, "/api/reports?type=course_progress&campusId=rgib", "/api/reports?type=teaching_delivery&campusId=rgib", "/api/reports?type=faculty_activity&campusId=rgib",
    "/api/reports?type=exam_readiness&campusId=rgib", "/api/reports?type=campus_track&campusId=rgib", "/api/reports/export?type=course_progress&format=csv&campusId=rgib", "/api/reports/export?type=campus_track&format=csv&campusId=rgib",
  ];

  it.each(Object.keys(forbidden))("%s: no response, export or aggregate on any read route contains another assignment's or batch's data", async (who) => {
    for (const path of reads()) {
      const res = await call(who, "get", path);
      expect([200, 400, 403, 404], `${who} ${path} -> ${res.status}`).toContain(res.status);
      for (const token of forbidden[who]!) expect(text(res), `${who} ${path} leaked ${token}`).not.toContain(token);
    }
  });

  it("faculty ONE sees exactly their own subject everywhere, with audience-filtered counts and totals", async () => {
    const f = "facOne";
    expect((await call(f, "get", "/api/subjects")).body.subjects.map((s: { name: string }) => s.name)).toEqual(["ONE-SUBJ"]);
    expect((await call(f, "get", "/api/batches")).body.batches).toEqual([expect.objectContaining({ name: "ONE-BATCH", subjectCount: 1, examCount: 1 })]); // THREE-SUBJ hidden; the batch-scoped exam is its own (the cohort exam belongs to the semester)
    expect((await call(f, "get", "/api/faculty")).body.faculty.map((x: { name: string }) => x.name)).toEqual(["ONE-FAC"]);
    expect((await call(f, "get", "/api/semesters")).body.semesters[0]).toMatchObject({ batchCount: 1, examCount: 2 });
    expect((await call(f, "get", "/api/exams")).body.exams.map((e: { name: string }) => e.name).sort()).toEqual(["COHORT-EXAM", "ONE-EXAM"]);
    expect((await call(f, "get", "/api/timetable")).body.entries.map((e: { subjectName: string }) => e.subjectName)).toEqual(["ONE-SUBJ"]);
    expect((await call(f, "get", "/api/progression?campusId=rgib")).body.subjects.map((s: { name: string }) => s.name)).toEqual(["ONE-SUBJ"]);
    const er = (await call(f, "get", "/api/exam-readiness?campusId=rgib")).body;
    expect(er.exams.map((e: { name: string }) => e.name).sort()).toEqual(["COHORT-EXAM", "ONE-EXAM"]);
    for (const e of er.exams) expect(e.subjects.map((s: { name: string }) => s.name)).toEqual(["ONE-SUBJ"]);
    const dash = (await call(f, "get", "/api/dashboard?campusId=rgib")).body;
    expect(dash.state.subjects).toBe(1);
    expect(dash.recentSessions.map((s: { subject: string }) => s.subject)).toEqual(["ONE-SUBJ"]);
    expect(dash.exams.map((e: { name: string }) => e.name).sort()).toEqual(["COHORT-EXAM", "ONE-EXAM"]);
    expect((await call(f, "get", "/api/session-logs/schedule?date=2026-10-06&campusId=rgib")).body.items).toEqual([]); // Tuesday belongs to TWO-SUBJ
    expect((await call(f, "get", `/api/session-logs/schedule?date=2026-10-06&campusId=rgib&facultyId=${ids.f2}`)).body.items).toEqual([]); // naming another faculty member changes nothing
    expect((await call(f, "get", "/api/session-logs/schedule?date=2026-10-05&campusId=rgib")).body.items.map((i: { subjectName: string }) => i.subjectName)).toEqual(["ONE-SUBJ"]);
    const rep = (await call(f, "get", "/api/reports?type=course_progress&campusId=rgib")).body;
    expect(JSON.stringify(rep.courseProgress.items ?? rep.courseProgress)).toContain("ONE-SUBJ");
  });

  it("faculty report totals (not just names) equal the same report filtered to that faculty member by an admin, and differ from the campus-wide one", async () => {
    for (const type of ["course_progress", "teaching_delivery", "faculty_activity", "exam_readiness", "campus_track"]) {
      const mine = (await call("facOne", "get", `/api/reports?type=${type}&campusId=rgib`)).body;
      const adminSame = (await call("admin", "get", `/api/reports?type=${type}&campusId=rgib&facultyId=${ids.f1}`)).body;
      const all = (await call("admin", "get", `/api/reports?type=${type}&campusId=rgib`)).body;
      const strip = (b: Record<string, unknown>) => JSON.stringify({ ...b, generatedAt: 0, filter: 0 });
      expect(strip(mine), type).toBe(strip(adminSame));
      if (type !== "exam_readiness") expect(strip(mine), type).not.toBe(strip(all));
    }
  });

  it("faculty TWO teaches in both batches: sees THREE-SUBJ and TWO-SUBJ (and the batches/exams they belong to), not ONE-SUBJ", async () => {
    const f = "facTwo";
    expect((await call(f, "get", "/api/subjects")).body.subjects.map((s: { name: string }) => s.name).sort()).toEqual(["THREE-SUBJ", "TWO-SUBJ"]);
    expect((await call(f, "get", `/api/subjects?batchId=${ids.b1}`)).body.subjects.map((s: { name: string }) => s.name)).toEqual(["THREE-SUBJ"]); // inside ONE-BATCH only their own subject
    expect((await call(f, "get", "/api/batches")).body.batches.map((b: { name: string; subjectCount: number }) => [b.name, b.subjectCount]).sort()).toEqual([["ONE-BATCH", 1], ["TWO-BATCH", 1]]);
    expect((await call(f, "get", "/api/exams")).body.exams.map((e: { name: string }) => e.name).sort()).toEqual(["COHORT-EXAM", "ONE-EXAM", "TWO-EXAM"]);
  });

  it("by-id access across assignments behaves like a missing record, for reads and for faculty writes", async () => {
    const pathsFor = (subject: string, log: string) => [`/api/progression/subjects/${subject}`, `/api/subjects/${subject}/syllabus`, `/api/subjects/${subject}/syllabus/export.csv`, `/api/session-logs/${log}`, `/api/session-logs/carry-forward?subjectId=${subject}&heldOn=2026-10-12`];
    for (const p of pathsFor(ids.s2!, ids.s2log!)) { const r = await call("facOne", "get", p); expect(r.status, `facOne ${p}`).toBe(404); expect(text(r)).not.toContain("TWO"); }
    for (const p of pathsFor(ids.s1!, ids.s1log!)) expect((await call("facOne", "get", p)).status, `facOne own ${p}`).toBe(200);
    for (const p of pathsFor(ids.s1!, ids.s1log!).filter((x) => !x.includes("session-logs"))) expect((await call("stuTwo", "get", p)).status, `stuTwo ${p}`).toBe(404);
    for (const p of pathsFor(ids.s1!, ids.s1log!).slice(0, 3)) expect((await call("stuOne", "get", p)).status, `stuOne own ${p}`).toBe(200);
    expect((await call("stuOne", "get", `/api/progression/subjects/${ids.s2}`)).status).toBe(404);
    // faculty cannot write into a colleague's subject (existing ownership rule, still in force)
    const w = await call("facOne", "post", "/api/session-logs", { subjectId: ids.s2, heldOn: "2026-09-15", timetableEntryId: ids.s2slot, outcome: "CANCELLED", notes: "hack attempt" });
    expect(w.status).toBe(403);
    expect(await db.prisma!.sessionLog.count({ where: { subjectId: ids.s2 } })).toBe(1);
  });

  it("faculty and students cannot reach any structural write route, for their own records or anyone's; nothing in the database changes", async () => {
    const counts = async () => JSON.stringify(await Promise.all([db.prisma!.subject.count(), db.prisma!.batch.count(), db.prisma!.faculty.count(), db.prisma!.semester.count(), db.prisma!.exam.count(), db.prisma!.timetableEntry.count(), db.prisma!.calendarEntry.count(), db.prisma!.sessionLog.count(), db.prisma!.syllabusTopic.count()]));
    const before = await counts();
    const snapshot = JSON.stringify(await db.prisma!.subject.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, facultyId: true, batchId: true } }));
    const writes: Array<[string, string, object?]> = [];
    for (const [sub, log] of [[ids.s1!, ids.s1log!], [ids.s2!, ids.s2log!]] as const) writes.push(
      ["patch", `/api/subjects/${sub}`, { name: "HACKED" }], ["delete", `/api/subjects/${sub}`], ["put", `/api/subjects/${sub}/syllabus`, { units: [] }],
      ["post", `/api/subjects/${sub}/syllabus/import`, { csv: "unit,topic,planned_hours\nA,B,1" }], ["post", `/api/subjects/${sub}/syllabus/import/preview`, { csv: "unit,topic,planned_hours\nA,B,1" }],
      ["post", `/api/session-logs/${log}/review`, {}],
    );
    for (const b of [ids.b1!, ids.b2!]) writes.push(["patch", `/api/batches/${b}`, { name: "HACKED" }], ["delete", `/api/batches/${b}`]);
    for (const f of [ids.f1!, ids.f2!]) writes.push(["patch", `/api/faculty/${f}`, { name: "HACKED" }], ["delete", `/api/faculty/${f}`]);
    writes.push(
      ["post", "/api/subjects", { code: "X", name: "x", batchId: ids.b1 }], ["post", "/api/batches", { name: "x", semesterId: ids.sem }], ["post", "/api/faculty", { name: "x", campusId: "rgib" }],
      ["post", "/api/semesters", { name: "x", academicYear: "2026-27", track: "MIRAI", campusId: "rgib", startsOn: "2030-01-01", endsOn: "2030-05-01", saturdayRule: "NONE" }],
      ["patch", `/api/semesters/${ids.sem}`, { name: "HACKED" }], ["delete", `/api/semesters/${ids.sem}`], ["post", `/api/semesters/${ids.sem}/deactivate`, {}], ["post", `/api/semesters/${ids.sem}/activate`, {}],
      ["post", "/api/exams", { name: "x", type: "SESSIONAL", semesterId: ids.sem, startsOn: "2026-11-02", endsOn: "2026-11-03" }], ["post", "/api/timetable", { subjectId: ids.s1, weekday: 5, startTime: "14:00", endTime: "15:00" }],
      ["post", "/api/calendar/entries", { title: "x", category: "HOLIDAY", startsOn: "2026-11-02", endsOn: "2026-11-02", campusId: "rgib" }],
      ["post", "/api/session-logs", { subjectId: ids.s2, heldOn: "2026-09-15", timetableEntryId: ids.s2slot, outcome: "CANCELLED", notes: "x" }],
    );
    for (const who of ["facOne", "stuOne", "stuTwo"]) for (const [m, p, body] of writes) {
      const r = await call(who, m as "post", p, body);
      // faculty may log sessions for their OWN subject only (the one allowed write); every other attempt here must be refused
      expect([400, 403, 404], `${who} ${m} ${p} -> ${r.status}`).toContain(r.status);
    }
    expect(await counts()).toBe(before);
    expect(JSON.stringify(await db.prisma!.subject.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, facultyId: true, batchId: true } }))).toBe(snapshot);
  });

  it("students: own batch only; every batch-specific route is scoped; the queue and reports are closed; no writes", async () => {
    const s1 = "stuOne";
    expect((await call(s1, "get", "/api/subjects")).body.subjects.map((s: { name: string }) => s.name).sort()).toEqual(["ONE-SUBJ", "THREE-SUBJ"]);
    expect((await call(s1, "get", "/api/batches")).body.batches.map((b: { name: string }) => b.name)).toEqual(["ONE-BATCH"]);
    expect((await call(s1, "get", "/api/faculty")).body.faculty.map((f: { name: string }) => f.name).sort()).toEqual(["ONE-FAC", "TWO-FAC"]); // the people who teach THEIR batch
    expect((await call(s1, "get", "/api/exams")).body.exams.map((e: { name: string }) => e.name).sort()).toEqual(["COHORT-EXAM", "ONE-EXAM"]);
    expect((await call(s1, "get", "/api/timetable")).body.entries.map((e: { subjectName: string }) => e.subjectName).sort()).toEqual(["ONE-SUBJ", "THREE-SUBJ"]);
    expect((await call(s1, "get", "/api/progression?campusId=rgib")).body.subjects.map((s: { name: string }) => s.name).sort()).toEqual(["ONE-SUBJ", "THREE-SUBJ"]);
    const dash = (await call(s1, "get", "/api/dashboard?campusId=rgib")).body;
    expect(dash.state.subjects).toBe(2); expect(dash.schedule.every((s: { code: string }) => s.code === "ONE-BATCH")).toBe(true);
    expect((await call(s1, "get", "/api/session-logs/schedule?date=2026-10-06&campusId=rgib")).body.items).toEqual([]);
    expect((await call(s1, "get", "/api/session-logs/pending?campusId=rgib")).status).toBe(403);
    for (const p of ["/api/session-logs", "/api/reports?type=course_progress&campusId=rgib", "/api/reports/export?type=course_progress&format=csv&campusId=rgib", `/api/session-logs/${ids.s1log}`]) expect((await call(s1, "get", p)).status, p).toBe(403);
    expect((await call(s1, "get", "/api/student/portal")).body.batch.name).toBe("ONE-BATCH");
    expect((await call(s1, "get", `/api/student/portal?batchId=${ids.b2}`)).status).toBe(403);
    const before = await db.prisma!.subject.count();
    for (const [m, p, b] of [["post", "/api/subjects", { code: "X", name: "x", batchId: ids.b1 }], ["patch", `/api/subjects/${ids.s1}`, { name: "HACKED" }], ["delete", `/api/timetable/${ids.s1slot}`], ["post", "/api/exams", { name: "x", type: "SESSIONAL", semesterId: ids.sem, startsOn: "2026-11-02", endsOn: "2026-11-03" }]] as const) expect([403, 404]).toContain((await call(s1, m, p, b as object | undefined)).status);
    expect(await db.prisma!.subject.count()).toBe(before);
    expect((await call("stuTwo", "get", "/api/subjects")).body.subjects.map((s: { name: string }) => s.name)).toEqual(["TWO-SUBJ"]);
    expect((await call("stuTwo", "get", "/api/exams")).body.exams.map((e: { name: string }) => e.name).sort()).toEqual(["COHORT-EXAM", "TWO-EXAM"]);
  });

  it("the student portal for a faculty member is limited to batches they teach; staff keep their access", async () => {
    expect((await call("facOne", "get", `/api/student/portal?batchId=${ids.b1}`)).status).toBe(200);
    expect((await call("facOne", "get", `/api/student/portal?batchId=${ids.b2}`)).status).toBe(404);
    expect((await call("facTwo", "get", `/api/student/portal?batchId=${ids.b1}`)).status).toBe(200); // teaches THREE-SUBJ there
    for (const who of ["mgr", "admin", "adminA"]) expect((await call(who, "get", `/api/student/portal?batchId=${ids.b2}`)).status, who).toBe(200);
  });

  it("campus managers and authorised admins keep the whole campus; the audience filter does not narrow them to one faculty or batch", async () => {
    for (const who of ["mgr", "adminA", "admin"]) {
      expect((await call(who, "get", "/api/subjects")).body.subjects.map((s: { name: string }) => s.name).sort(), who).toEqual(["ONE-SUBJ", "THREE-SUBJ", "TWO-SUBJ"]);
      expect((await call(who, "get", "/api/batches")).body.batches).toHaveLength(2);
      expect((await call(who, "get", "/api/faculty")).body.faculty).toHaveLength(2);
      expect((await call(who, "get", "/api/exams")).body.exams).toHaveLength(3);
      expect((await call(who, "get", "/api/timetable")).body.entries).toHaveLength(3);
      expect((await call(who, "get", "/api/dashboard?campusId=rgib")).body.state.subjects).toBe(3);
      expect((await call(who, "get", "/api/progression?campusId=rgib")).body.subjects).toHaveLength(3);
    }
    expect((await call("mgr", "post", "/api/timetable", { subjectId: ids.s2, weekday: 5, startTime: "11:00", endTime: "12:00" })).status).toBe(201); // writes unchanged
  });

  it("development demo mode: a faculty/student preview is limited by the demo identity headers, and with no identity chosen it sees nothing", async () => {
    const get = (path: string, h: Record<string, string>) => { let t = request(dev).get(path); for (const [k, v] of Object.entries(h)) t = t.set(k, v); return t; };
    const one = await get("/api/subjects", { "X-Demo-Role": "faculty", "X-Demo-Faculty": ids.f1! });
    expect(one.body.subjects.map((s: { name: string }) => s.name)).toEqual(["ONE-SUBJ"]);
    const noOne = await get("/api/subjects", { "X-Demo-Role": "faculty" }); // faculty role, no one chosen: an empty list, not an error and not everything
    expect(noOne.status).toBe(200); expect(noOne.body.subjects).toEqual([]);
    expect((await get("/api/subjects", { "X-Demo-Role": "student", "X-Demo-Batch": ids.b2! })).body.subjects.map((s: { name: string }) => s.name)).toEqual(["TWO-SUBJ"]);
    const noBatch = await get("/api/subjects", { "X-Demo-Role": "student" });
    expect(noBatch.status).toBe(200); expect(noBatch.body.subjects).toEqual([]);
    for (const path of ["/api/batches", "/api/exams", "/api/timetable", "/api/faculty", "/api/semesters", "/api/progression?campusId=rgib", "/api/exam-readiness?campusId=rgib", "/api/dashboard?campusId=rgib"]) {
      for (const role of ["faculty", "student"]) { if (path === "/api/batches" && role === "student") continue; const r = await get(path, { "X-Demo-Role": role }); expect(r.status, `${role} ${path}`).toBe(200); expect(text(r), `${role} ${path}`).not.toMatch(/ONE-|TWO-|THREE-/); }
    }
    // the one exception: a student preview that has not picked a batch may list batch names to pick from (no subjects or counts)
    const picker = await get("/api/batches", { "X-Demo-Role": "student" });
    expect(picker.status).toBe(200); expect(picker.body.batches.map((x: { subjectCount: number }) => x.subjectCount)).toEqual([0, 0]);
    expect((await get("/api/subjects", { "X-Demo-Role": "admin" })).body.subjects).toHaveLength(3); // an admin preview of the default campus (rgib here) sees the campus
  });

  it("spoofed faculty/batch headers cannot widen a signed-in faculty member or student", async () => {
    const spoof = { "X-Demo-Role": "admin", "X-Demo-Campus": "*", "X-Demo-Faculty": ids.f2!, "X-Demo-Batch": ids.b2! };
    for (const [who, expected] of [["facOne", ["ONE-SUBJ"]], ["stuTwo", ["TWO-SUBJ"]]] as const) {
      let t = request(prod).get("/api/subjects").set("Cookie", cookies[who]!); for (const [k, v] of Object.entries(spoof)) t = t.set(k, v);
      expect((await t).body.subjects.map((s: { name: string }) => s.name)).toEqual(expected);
    }
  });
});
