/**
 * Campus-isolation security matrix (real PostgreSQL). Two campuses with distinguishable data — ALPHA (rgib) and BRAVO (juj) — and a
 * production-mode app (demo headers OFF, signed sessions only). Every assertion looks at response CONTENT (no BRAVO text may reach a
 * campus-A caller) and, for rejected writes, at the DATABASE (nothing may have changed).
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDatabase, type Database } from "./db/client.js";
import { createAuth, hashPassword } from "./services/auth.js";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const A = "rgib", B = "juj";

suite("campus isolation (PostgreSQL)", () => {
  let db: Database;
  let dev: ReturnType<typeof createApp>;
  let prod: ReturnType<typeof createApp>;
  const clock = new Date("2026-10-05T08:00:00Z");
  const ids: Record<string, string> = {};
  const admin = (t: request.Test) => t.set("X-Demo-Role", "admin");
  const cookies: Record<string, string> = {};
  const as = (who: string) => (t: request.Test) => (who === "anon" ? t : t.set("Cookie", cookies[who]!));
  const call = (who: string, method: "get" | "post" | "patch" | "put" | "delete", path: string, body?: object) => {
    const t = as(who)(request(prod)[method](path));
    return body === undefined ? t : t.send(body);
  };
  const text = (res: request.Response) => JSON.stringify(res.body) + (res.text ?? "");

  /** Everything BRAVO owns, as a string: if an unauthorized request changed anything, this changes. */
  const bravoSnapshot = async () => {
    const p = db.prisma!;
    return JSON.stringify(await Promise.all([
      p.semester.findMany({ where: { campusId: B }, orderBy: { id: "asc" } }), p.batch.findMany({ where: { semester: { campusId: B } }, orderBy: { id: "asc" } }),
      p.faculty.findMany({ where: { campusId: B }, orderBy: { id: "asc" } }), p.subject.findMany({ where: { batch: { semester: { campusId: B } } }, orderBy: { id: "asc" } }),
      p.timetableEntry.findMany({ where: { subject: { batch: { semester: { campusId: B } } } }, orderBy: { id: "asc" } }),
      p.exam.findMany({ where: { semester: { campusId: B } }, orderBy: { id: "asc" } }), p.calendarEntry.findMany({ orderBy: { id: "asc" } }),
      p.sessionLog.findMany({ where: { subject: { batch: { semester: { campusId: B } } } }, include: { topicEntries: true }, orderBy: { id: "asc" } }),
      p.syllabusTopic.findMany({ where: { unit: { subject: { batch: { semester: { campusId: B } } } } }, orderBy: { id: "asc" } }),
    ]));
  };
  const totals = async () => { const p = db.prisma!; return JSON.stringify([await p.semester.count(), await p.batch.count(), await p.faculty.count(), await p.subject.count(), await p.timetableEntry.count(), await p.exam.count(), await p.calendarEntry.count(), await p.sessionLog.count()]); };

  beforeAll(async () => {
    execSync("npx prisma migrate deploy", { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    db = createDatabase(url);
    await db.prisma!.$executeRawUnsafe(`TRUNCATE "SessionTopicEntry","SessionLogRevision","SessionLog","Exam","CalendarEntry","TimetableEntry","SyllabusTopic","SyllabusUnit","Subject","Batch","Faculty","Semester" RESTART IDENTITY CASCADE`);
    dev = createApp({ CORS_ORIGIN: "http://localhost:5173" }, db, () => clock); // real development defaults: a demo preview is ONE campus
    const setup = createApp({ CORS_ORIGIN: "http://localhost:5173", DEMO_DEFAULT_CAMPUS: "*" }, db, () => clock); // fixture builder only
    const post = async (path: string, body: object) => { const r = await admin(request(setup).post(path)).send(body); if (r.status >= 300) throw new Error(`${path} -> ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
    for (const [k, campus, tag] of [["a", A, "ALPHA"], ["b", B, "BRAVO"]] as const) {
      const sem = await post("/api/semesters", { name: `${tag} Semester`, academicYear: "2026-27", track: "MIRAI", campusId: campus, startsOn: "2026-09-07", endsOn: "2026-12-18", saturdayRule: "NONE" });
      await admin(request(setup).post(`/api/semesters/${sem.id}/activate`)).send({});
      ids[`sem${k}`] = sem.id;
      ids[`batch${k}`] = (await post("/api/batches", { name: `${tag} Batch`, semesterId: sem.id })).id;
      ids[`fac${k}`] = (await post("/api/faculty", { name: `${tag} Faculty`, campusId: campus })).id;
      ids[`sub${k}`] = (await post("/api/subjects", { code: `${tag.slice(0, 2)}1`, name: `${tag} Subject`, batchId: ids[`batch${k}`], facultyId: ids[`fac${k}`] })).id;
      const syl = await admin(request(setup).put(`/api/subjects/${ids[`sub${k}`]}/syllabus`)).send({ units: [{ title: `${tag} Unit`, topics: [{ title: `${tag} topic`, plannedHours: 4 }] }] });
      ids[`topic${k}`] = syl.body.units[0].topics[0].id;
      ids[`slot${k}`] = (await post("/api/timetable", { subjectId: ids[`sub${k}`], weekday: 1, startTime: "09:00", endTime: "10:00", room: `${tag}-R1` })).id;
      ids[`exam${k}`] = (await post("/api/exams", { name: `${tag} Exam`, type: "MID_TERM", semesterId: sem.id, startsOn: "2026-10-26", endsOn: "2026-10-30" })).id;
      ids[`cal${k}`] = (await post("/api/calendar/entries", { title: `${tag} Holiday`, category: "HOLIDAY", startsOn: "2026-10-12", campusId: campus })).id;
      const log = await post("/api/session-logs", { subjectId: ids[`sub${k}`], heldOn: "2026-09-07", timetableEntryId: ids[`slot${k}`], outcome: "COMPLETED", covered: [{ topicId: ids[`topic${k}`], completionPct: 100 }], notes: `${tag} note` });
      ids[`log${k}`] = log.log.id;
    }
    ids.calGlobal = (await post("/api/calendar/entries", { title: "GLOBAL Holiday", category: "HOLIDAY", startsOn: "2026-10-02", campusId: null })).id;

    const pw = (who: string) => `${who}-passphrase-123`;
    const accounts = [
      { email: "admin", role: "admin" }, { email: "adminA", role: "admin", campusIds: [A] },
      { email: "mgrA", role: "campus_manager", campusIds: [A] }, { email: "mgrB", role: "campus_manager", campusIds: [B] }, { email: "mgrAB", role: "campus_manager", campusIds: [A, B] }, { email: "mgrNone", role: "campus_manager" },
      { email: "facA", role: "faculty", facultyId: ids.faca }, { email: "facB", role: "faculty", facultyId: ids.facb }, { email: "facGhost", role: "faculty", facultyId: "no-such-faculty" }, { email: "facUnlinked", role: "faculty" },
      { email: "stuA", role: "student", batchId: ids.batcha }, { email: "stuB", role: "student", batchId: ids.batchb }, { email: "stuNone", role: "student" }, { email: "stuGhost", role: "student", batchId: "no-such-batch" },
    ].map((a) => ({ ...a, email: `${a.email}@t.test`, passwordHash: hashPassword(pw(a.email)) }));
    prod = createApp({ CORS_ORIGIN: "http://localhost:5173", NODE_ENV: "production", ALLOW_DEMO_HEADERS: false, AUTH_USERS: JSON.stringify(accounts), SESSION_SECRET: "s".repeat(40) } as never, db, () => clock);
    for (const a of accounts) {
      const who = a.email.replace("@t.test", "");
      cookies[who] = String((await request(prod).post("/api/auth/login").send({ email: a.email, password: pw(who) })).headers["set-cookie"]?.[0]).split(";")[0]!;
    }
  });
  afterAll(async () => { await db?.close(); });

  /* ------------------------------------------------------------------ */
  describe("route inventory: every /api route is classified, so a new unscoped route cannot slip in", () => {
    const campusScoped = new Set([
      "GET /calendar/month", "GET /calendar/export.csv", "POST /calendar/entries", "PATCH /calendar/entries/:id", "DELETE /calendar/entries/:id",
      "GET /dashboard", "GET /exam-readiness", "GET /exams", "GET /exams/export.csv", "POST /exams", "PATCH /exams/:id", "DELETE /exams/:id",
      "GET /batches", "POST /batches", "PATCH /batches/:id", "DELETE /batches/:id", "GET /faculty", "POST /faculty", "PATCH /faculty/:id", "DELETE /faculty/:id",
      "GET /progression/subjects/:id", "GET /progression", "GET /reports", "GET /reports/export",
      "GET /semesters", "POST /semesters", "PATCH /semesters/:id", "POST /semesters/:id/activate", "POST /semesters/:id/deactivate", "DELETE /semesters/:id",
      "GET /session-logs/schedule", "GET /session-logs/pending", "GET /session-logs/carry-forward", "GET /session-logs", "GET /session-logs/:id", "POST /session-logs", "PATCH /session-logs/:id", "POST /session-logs/:id/review",
      "GET /student/portal",
      "GET /subjects", "GET /subjects/export.csv", "POST /subjects", "PATCH /subjects/:id", "DELETE /subjects/:id",
      "GET /subjects/:id/syllabus", "PUT /subjects/:id/syllabus", "GET /subjects/:id/syllabus/export.csv", "POST /subjects/:id/syllabus/import/preview", "POST /subjects/:id/syllabus/import",
      "GET /timetable", "GET /timetable/export.csv", "POST /timetable", "PATCH /timetable/:id", "DELETE /timetable/:id",
    ]);
    const publicRoutes = new Set(["GET /health", "GET /meta", "GET /auth/config", "GET /auth/session", "POST /auth/login", "POST /auth/logout"]);
    const routes = () => {
      const found: string[] = [];
      const walk = (stack: Array<{ route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: unknown[] } }>) => {
        for (const l of stack) {
          if (l.route) for (const m of Object.keys(l.route.methods)) found.push(`${m.toUpperCase()} ${l.route.path}`);
          else if (l.handle?.stack) walk(l.handle.stack as never);
        }
      };
      walk((prod as unknown as { router?: { stack: never[] }; _router?: { stack: never[] } })._router?.stack ?? (prod as unknown as { router: { stack: never[] } }).router.stack);
      return found;
    };
    it("lists exactly the routes this matrix knows about (60), none unclassified", () => {
      const found = routes().sort();
      const known = [...campusScoped, ...publicRoutes].sort();
      expect(found.filter((r) => !known.includes(r)), "routes with no classification").toEqual([]);
      expect(known.filter((r) => !found.includes(r)), "classified routes that no longer exist").toEqual([]);
      expect(found).toHaveLength(60);
      expect(campusScoped.size).toBe(54);
    });
  });

  /* ------------------------------------------------------------------ */
  describe("reads: each caller sees only their own campus (response contents, not just status)", () => {
    // [description, path for A, path for B, marker A, marker B, kind]
    const reads: Array<[string, string, string, "list" | "byId" | "campus"]> = [
      ["semesters", `/api/semesters`, `/api/semesters?campusId=${B}`, "campus"],
      ["batches", `/api/batches`, `/api/batches?campusId=${B}`, "campus"],
      ["faculty", `/api/faculty`, `/api/faculty?campusId=${B}`, "campus"],
      ["subjects", `/api/subjects`, `/api/subjects?campusId=${B}`, "campus"],
      ["exams", `/api/exams`, `/api/exams?campusId=${B}`, "campus"],
      ["timetable", `/api/timetable`, `/api/timetable?semesterId=SEM_B`, "list"],
      ["calendar month", `/api/calendar/month?campusId=${A}&track=MIRAI&month=2026-10`, `/api/calendar/month?campusId=${B}&track=MIRAI&month=2026-10`, "campus"],
      ["calendar csv", `/api/calendar/export.csv?campusId=${A}`, `/api/calendar/export.csv?campusId=${B}`, "campus"],
      ["subjects csv", `/api/subjects/export.csv?semesterId=SEM_A`, `/api/subjects/export.csv?semesterId=SEM_B`, "list"],
      ["timetable csv", `/api/timetable/export.csv?semesterId=SEM_A`, `/api/timetable/export.csv?semesterId=SEM_B`, "list"],
      ["exams csv", `/api/exams/export.csv`, `/api/exams/export.csv?campusId=${B}`, "campus"],
      ["progression list", `/api/progression?campusId=${A}`, `/api/progression?campusId=${B}`, "campus"],
      ["progression subject", `/api/progression/subjects/SUB_A`, `/api/progression/subjects/SUB_B`, "byId"],
      ["exam readiness", `/api/exam-readiness?campusId=${A}`, `/api/exam-readiness?campusId=${B}`, "campus"],
      ["schedule", `/api/session-logs/schedule?date=2026-10-05&campusId=${A}`, `/api/session-logs/schedule?date=2026-10-05&campusId=${B}`, "campus"],
      ["pending", `/api/session-logs/pending?campusId=${A}&days=14`, `/api/session-logs/pending?campusId=${B}&days=14`, "campus"],
      ["syllabus", `/api/subjects/SUB_A/syllabus`, `/api/subjects/SUB_B/syllabus`, "byId"],
      ["syllabus csv", `/api/subjects/SUB_A/syllabus/export.csv`, `/api/subjects/SUB_B/syllabus/export.csv`, "byId"],
      ["carry-forward", `/api/session-logs/carry-forward?subjectId=SUB_A&heldOn=2026-09-14`, `/api/session-logs/carry-forward?subjectId=SUB_B&heldOn=2026-09-14`, "byId"],
      ["session log detail", `/api/session-logs/LOG_A`, `/api/session-logs/LOG_B`, "byId"],
      ["reports (JSON)", `/api/reports?type=course_progress&campusId=${A}`, `/api/reports?type=course_progress&campusId=${B}`, "campus"],
      ["reports (CSV)", `/api/reports/export?type=course_progress&format=csv&campusId=${A}`, `/api/reports/export?type=course_progress&format=csv&campusId=${B}`, "campus"],
      ["dashboard", `/api/dashboard?campusId=${A}`, `/api/dashboard?campusId=${B}`, "campus"],
    ];
    const fill = (p: string) => p.replace("SEM_A", ids.sema!).replace("SEM_B", ids.semb!).replace("SUB_A", ids.suba!).replace("SUB_B", ids.subb!).replace("LOG_A", ids.loga!).replace("LOG_B", ids.logb!);
    // Roles that may call each read; session-logs and reports are not for students.
    const mustSee = new Set(["semesters", "batches", "faculty", "subjects", "exams", "timetable", "calendar month", "calendar csv", "subjects csv", "timetable csv", "exams csv", "syllabus", "syllabus csv", "session log detail", "progression subject"]);
    const staffOnly = new Set(["session log detail", "carry-forward", "reports (JSON)", "reports (CSV)"]);

    it.each(reads)("%s: campus-A manager, faculty and student never see BRAVO; a manager asking for B is refused", async (name, pa, pb, kind) => {
      for (const who of ["mgrA", "facA", "stuA"]) {
        if (who === "stuA" && staffOnly.has(name)) { expect((await call(who, "get", fill(pa))).status, `${who} ${name}`).toBe(403); continue; }
        const own = await call(who, "get", fill(pa));
        // a faculty member may only log/read their own subject's log; everything else on their campus is readable
        expect([200, 403]).toContain(own.status);
        expect(text(own), `${who} ${name}`).not.toContain("BRAVO");
        if (own.status === 200 && mustSee.has(name)) expect(text(own), `${who} ${name} should see ALPHA`).toContain("ALPHA");
      }
      const foreign = await call("mgrA", "get", fill(pb));
      if (kind === "list") { expect(foreign.status).toBe(200); expect(text(foreign)).not.toContain("BRAVO"); }
      else { expect(foreign.status, `${name} for B`).toBe(kind === "byId" ? 404 : 403); expect(foreign.body.error).toBe(kind === "byId" ? "not_found" : "forbidden_campus"); expect(text(foreign)).not.toContain("BRAVO"); }
      // the mirror image: B's manager sees B, never A
      const mine = await call("mgrB", "get", fill(pb));
      expect(mine.status).toBe(200); expect(text(mine)).not.toContain("ALPHA");
      // organization-wide admin still sees both
      const both = await call("admin", "get", fill(pb));
      expect(both.status).toBe(200);
    });

    it("lists without a campus parameter are restricted in the QUERY: an unscoped GET returns only the caller's campus", async () => {
      for (const path of ["/api/semesters", "/api/batches", "/api/faculty", "/api/subjects", "/api/exams", "/api/timetable"]) {
        expect(text(await call("mgrA", "get", path)), path).not.toContain("BRAVO");
        expect(text(await call("stuA", "get", path)), path).not.toContain("BRAVO");
        const all = text(await call("admin", "get", path));
        expect(all, path).toContain("ALPHA"); expect(all, path).toContain("BRAVO");
      }
      const sessionLogs = await call("mgrA", "get", "/api/session-logs");
      expect(sessionLogs.body.logs.length).toBeGreaterThan(0); expect(text(sessionLogs)).not.toContain("BRAVO");
    });

    it("filtering a list by another campus's batch, semester, subject or faculty id returns nothing of theirs", async () => {
      for (const path of [`/api/subjects?batchId=${ids.batchb}`, `/api/subjects?semesterId=${ids.semb}`, `/api/subjects?facultyId=${ids.facb}`, `/api/timetable?batchId=${ids.batchb}`, `/api/timetable?facultyId=${ids.facb}`, `/api/batches?semesterId=${ids.semb}`, `/api/exams?semesterId=${ids.semb}`, `/api/session-logs?subjectId=${ids.subb}`, `/api/session-logs?batchId=${ids.batchb}`]) {
        const res = await call("mgrA", "get", path);
        expect(res.status, path).toBe(200);
        expect(text(res), path).not.toContain("BRAVO");
        const rows = (Object.values(res.body).find(Array.isArray) as unknown[]) ?? [];
        expect(rows, path).toHaveLength(0);
      }
    });

    it("institution-wide calendar entries stay visible to every campus (they belong to none)", async () => {
      const m = await call("mgrA", "get", `/api/calendar/month?campusId=${A}&track=MIRAI&month=2026-10`);
      expect(m.body.entries.map((e: { title: string }) => e.title).sort()).toEqual(["ALPHA Holiday", "GLOBAL Holiday"]);
      expect(text(await call("mgrB", "get", `/api/calendar/month?campusId=${B}&track=MIRAI&month=2026-10`))).toContain("GLOBAL Holiday");
    });

    it("dashboard: totals and the campus list contain only the caller's campus; the default campus is the account's own", async () => {
      const own = await call("mgrB", "get", "/api/dashboard"); // no campusId: must default to B, not to the global default
      expect(own.status).toBe(200); expect(own.body.context.campus.id).toBe(B);
      expect(own.body.campuses.map((c: { id: string }) => c.id)).toEqual([B]);
      const a = await call("mgrA", "get", `/api/dashboard?campusId=${A}`);
      expect(a.body.campuses.map((c: { id: string }) => c.id)).toEqual([A]);
      expect(text(a)).not.toContain("BRAVO");
      const admin1 = await call("admin", "get", `/api/dashboard?campusId=${B}`);
      expect(admin1.body.campuses.length).toBe(4);
      expect((await call("mgrAB", "get", "/api/dashboard")).body.campuses.map((c: { id: string }) => c.id).sort()).toEqual([A, B].sort());
    });

    it("reports without a campus: a one-campus manager gets their own campus only; a multi-campus manager must choose; admin gets all", async () => {
      const mine = await call("mgrA", "get", "/api/reports?type=campus_track");
      expect(mine.status).toBe(200); expect(text(mine)).not.toContain("juj"); expect(text(mine)).not.toContain("BRAVO");
      const csv = await call("mgrA", "get", "/api/reports/export?type=exam_readiness&format=csv");
      expect(csv.status).toBe(200); expect(csv.text).not.toContain("BRAVO");
      expect((await call("mgrAB", "get", "/api/reports?type=campus_track")).status).toBe(400);
      const all = await call("admin", "get", "/api/reports?type=campus_track");
      expect(all.status).toBe(200); expect(text(all)).toContain("juj");
      const facultyActivity = await call("mgrA", "get", `/api/reports?type=faculty_activity&campusId=${A}&facultyId=${ids.facb}`); // a foreign faculty id inside an allowed campus
      expect(facultyActivity.status).toBe(200); expect(text(facultyActivity)).not.toContain("BRAVO");
    });

    it("student portal: own batch only; manipulated batch ids are refused; staff are scoped too", async () => {
      expect((await call("stuA", "get", "/api/student/portal")).body.batch.name).toBe("ALPHA Batch");
      expect((await call("stuA", "get", `/api/student/portal?batchId=${ids.batchb}`)).status).toBe(403);
      expect((await call("stuB", "get", `/api/student/portal?batchId=${ids.batcha}`)).status).toBe(403);
      expect((await call("mgrA", "get", `/api/student/portal?batchId=${ids.batchb}`)).status).toBe(404);
      expect((await call("mgrA", "get", `/api/student/portal?batchId=${ids.batcha}`)).status).toBe(200);
      expect((await call("admin", "get", `/api/student/portal?batchId=${ids.batchb}`)).body.batch.name).toBe("BRAVO Batch");
    });
  });

  /* ------------------------------------------------------------------ */
  describe("writes: a campus-A manager cannot modify, create into, or move records onto campus B (and the database proves it)", () => {
    it("modifying or deleting B's records by id is a 404 and changes nothing", async () => {
      const before = await bravoSnapshot();
      // semester writes are admin-only by ROLE, so those are attempted as the campus-A-limited admin; everything else as the campus-A manager
      for (const [label, method, path, body] of [["patch", "patch", `/api/semesters/${ids.semb}`, { name: "HACKED" }], ["activate", "post", `/api/semesters/${ids.semb}/activate`, {}], ["deactivate", "post", `/api/semesters/${ids.semb}/deactivate`, {}], ["delete sem", "delete", `/api/semesters/${ids.semb}`]] as const) {
        const res = await call("adminA", method, path, body as object | undefined);
        expect(res.status, label).toBe(404); expect(text(res), label).not.toContain("BRAVO");
      }
      expect((await call("mgrA", "patch", `/api/semesters/${ids.semb}`, { name: "HACKED" })).status).toBe(403); // a manager has no semester-write role at all
      const attempts: Array<[string, "patch" | "delete" | "post" | "put", string, object?]> = [
        ["batch patch", "patch", `/api/batches/${ids.batchb}`, { name: "HACKED" }], ["batch delete", "delete", `/api/batches/${ids.batchb}`],
        ["faculty patch", "patch", `/api/faculty/${ids.facb}`, { name: "HACKED" }], ["faculty delete", "delete", `/api/faculty/${ids.facb}`],
        ["subject patch", "patch", `/api/subjects/${ids.subb}`, { name: "HACKED" }], ["subject delete", "delete", `/api/subjects/${ids.subb}?confirm=true`],
        ["syllabus put", "put", `/api/subjects/${ids.subb}/syllabus`, { units: [{ title: "HACKED", topics: [{ title: "HACKED", plannedHours: 1 }] }] }],
        ["syllabus import", "post", `/api/subjects/${ids.subb}/syllabus/import`, { csv: "unit,topic,hours,exam_scope\nHACKED,HACKED,1,", confirmReplace: true }],
        ["syllabus preview", "post", `/api/subjects/${ids.subb}/syllabus/import/preview`, { csv: "unit,topic,hours,exam_scope\nX,Y,1," }],
        ["timetable patch", "patch", `/api/timetable/${ids.slotb}`, { room: "HACKED" }], ["timetable delete", "delete", `/api/timetable/${ids.slotb}`],
        ["exam patch", "patch", `/api/exams/${ids.examb}`, { name: "HACKED" }], ["exam delete", "delete", `/api/exams/${ids.examb}`],
        ["calendar patch", "patch", `/api/calendar/entries/${ids.calb}`, { title: "HACKED" }], ["calendar delete", "delete", `/api/calendar/entries/${ids.calb}`],
        ["log patch", "patch", `/api/session-logs/${ids.logb}`, { notes: "HACKED", correctionNote: "hack attempt" }], ["log review", "post", `/api/session-logs/${ids.logb}/review`, { note: "HACKED" }],
      ];
      for (const [label, method, path, body] of attempts) {
        const res = await call("mgrA", method, path, body);
        expect(res.status, label).toBe(404);
        expect(text(res), label).not.toContain("BRAVO");
      }
      expect(await bravoSnapshot()).toBe(before);
    });

    it("creating a record on campus B, or referencing B's records from a new campus-A record, is refused and creates nothing", async () => {
      const before = await totals(), snap = await bravoSnapshot();
      const attempts: Array<[string, string, object, number]> = [
        ["semester on B (as a manager: no role)", "/api/semesters", { name: "X", academicYear: "2026-27", track: "UNIVERSITY", campusId: B, startsOn: "2027-01-04", endsOn: "2027-05-28", saturdayRule: "NONE" }, 403],
        ["faculty on B", "/api/faculty", { name: "X", campusId: B }, 403],
        ["batch in B's semester", "/api/batches", { name: "X", semesterId: ids.semb }, 400],
        ["subject in B's batch", "/api/subjects", { code: "X1", name: "X", batchId: ids.batchb }, 400],
        ["subject with B's faculty", "/api/subjects", { code: "X2", name: "X", batchId: ids.batcha, facultyId: ids.facb }, 400],
        ["timetable slot on B's subject", "/api/timetable", { subjectId: ids.subb, weekday: 3, startTime: "09:00", endTime: "10:00" }, 400],
        ["exam in B's semester", "/api/exams", { name: "X", type: "SESSIONAL", semesterId: ids.semb, startsOn: "2026-11-02", endsOn: "2026-11-03" }, 400],
        ["exam scoped to B's batch", "/api/exams", { name: "X", type: "SESSIONAL", semesterId: ids.sema, batchId: ids.batchb, startsOn: "2026-11-02", endsOn: "2026-11-03" }, 400],
        ["calendar entry on B", "/api/calendar/entries", { title: "X", category: "EVENT", startsOn: "2026-11-02", campusId: B }, 403],
        ["institution-wide calendar entry", "/api/calendar/entries", { title: "X", category: "HOLIDAY", startsOn: "2026-11-02", campusId: null }, 403],
        ["session log on B's subject", "/api/session-logs", { subjectId: ids.subb, heldOn: "2026-09-14", timetableEntryId: ids.slotb, outcome: "CANCELLED", notes: "hack attempt" }, 400],
      ];
      for (const [label, path, body, status] of attempts) {
        const res = await call("mgrA", "post", path, body);
        expect(res.status, label).toBe(status);
        expect(text(res), label).not.toContain("BRAVO");
      }
      expect(await totals()).toBe(before);
      expect(await bravoSnapshot()).toBe(snap);
    });

    it("moving a record onto B (campus, batch, faculty, semester) is refused", async () => {
      const before = await totals(), snap = await bravoSnapshot();
      const semA = await db.prisma!.semester.findUniqueOrThrow({ where: { id: ids.sema! } });
      expect((await call("adminA", "patch", `/api/semesters/${ids.sema}`, { campusId: B })).status).toBe(403);
      expect((await call("mgrA", "patch", `/api/faculty/${ids.faca}`, { campusId: B })).status).toBe(403);
      expect((await call("mgrA", "patch", `/api/subjects/${ids.suba}`, { batchId: ids.batchb })).status).toBe(400);
      expect((await call("mgrA", "patch", `/api/subjects/${ids.suba}`, { facultyId: ids.facb })).status).toBe(400);
      expect((await call("mgrA", "patch", `/api/calendar/entries/${ids.cala}`, { campusId: B })).status).toBe(403);
      expect((await call("mgrA", "patch", `/api/calendar/entries/${ids.cala}`, { campusId: null })).status).toBe(403);
      expect((await call("mgrA", "patch", `/api/calendar/entries/${ids.calGlobal}`, { title: "HACKED" })).status).toBe(403);
      expect((await call("mgrA", "delete", `/api/calendar/entries/${ids.calGlobal}`)).status).toBe(403);
      expect(await totals()).toBe(before); expect(await bravoSnapshot()).toBe(snap);
      expect(await db.prisma!.semester.findUniqueOrThrow({ where: { id: ids.sema! } })).toEqual(semA);
      expect((await db.prisma!.subject.findUniqueOrThrow({ where: { id: ids.suba! } })).batchId).toBe(ids.batcha);
    });

    it("what a campus-A manager may do on campus A still works", async () => {
      expect((await call("mgrA", "post", "/api/faculty", { name: "ALPHA New Faculty", campusId: A })).status).toBe(201);
      const slot = await call("mgrA", "post", "/api/timetable", { subjectId: ids.suba, weekday: 4, startTime: "11:00", endTime: "12:00" });
      expect(slot.status).toBe(201);
      expect((await call("mgrA", "patch", `/api/timetable/${slot.body.id}`, { room: "ALPHA-R9" })).status).toBe(200);
      expect((await call("mgrA", "delete", `/api/timetable/${slot.body.id}`)).status).toBe(204);
      expect((await call("mgrA", "post", "/api/calendar/entries", { title: "ALPHA Event", category: "EVENT", startsOn: "2026-11-03", campusId: A })).status).toBe(201);
      expect((await call("mgrA", "post", "/api/semesters", { name: "x", academicYear: "2026-27", track: "MIRAI", campusId: A, startsOn: "2027-01-04", endsOn: "2027-05-28", saturdayRule: "NONE" })).status).toBe(403); // semester writes are admin-only by role, unchanged
    });

    it("organization-wide administration still works, while a campus-limited admin is limited like anyone else", async () => {
      expect((await call("admin", "post", "/api/faculty", { name: "BRAVO Admin-added", campusId: B })).status).toBe(201);
      expect((await call("admin", "post", "/api/calendar/entries", { title: "GLOBAL Event", category: "EVENT", startsOn: "2026-11-04", campusId: null })).status).toBe(201);
      expect((await call("admin", "patch", `/api/calendar/entries/${ids.calGlobal}`, { description: "updated by org admin" })).status).toBe(200);
      const sem = await call("admin", "post", "/api/semesters", { name: "BRAVO Next", academicYear: "2027-28", track: "UNIVERSITY", campusId: B, startsOn: "2027-01-04", endsOn: "2027-05-28", saturdayRule: "NONE" });
      expect(sem.status).toBe(201);
      expect((await call("admin", "delete", `/api/semesters/${sem.body.id}`)).status).toBe(204);
      // adminA is an admin account configured for campus A only
      const snap = await bravoSnapshot();
      expect((await call("adminA", "post", "/api/faculty", { name: "X", campusId: B })).status).toBe(403);
      expect((await call("adminA", "get", `/api/subjects?campusId=${B}`)).status).toBe(403);
      expect((await call("adminA", "post", "/api/calendar/entries", { title: "X", category: "EVENT", startsOn: "2026-11-04", campusId: null })).status).toBe(403);
      expect((await call("adminA", "post", "/api/semesters", { name: "A next", academicYear: "2027-28", track: "UNIVERSITY", campusId: A, startsOn: "2027-01-04", endsOn: "2027-05-28", saturdayRule: "NONE" })).status).toBe(201);
      expect(await bravoSnapshot()).toBe(snap);
    });

    it("faculty: own subject only, and nothing across campuses (404 beats ownership for foreign records)", async () => {
      const snap = await bravoSnapshot();
      expect((await call("facA", "post", "/api/session-logs", { subjectId: ids.subb, heldOn: "2026-09-14", timetableEntryId: ids.slotb, outcome: "CANCELLED", notes: "hack attempt" })).status).toBe(400);
      expect((await call("facB", "post", "/api/session-logs", { subjectId: ids.suba, heldOn: "2026-09-14", timetableEntryId: ids.slota, outcome: "CANCELLED", notes: "hack attempt" })).status).toBe(400);
      expect((await call("facA", "get", `/api/session-logs/${ids.logb}`)).status).toBe(404);
      expect((await call("facA", "get", `/api/session-logs/carry-forward?subjectId=${ids.subb}&heldOn=2026-09-14`)).status).toBe(404);
      expect((await call("facA", "patch", `/api/session-logs/${ids.logb}`, { notes: "HACKED", correctionNote: "hack attempt" })).status).toBe(404);
      expect((await call("facA", "get", `/api/reports?type=course_progress&campusId=${B}`)).status).toBe(403);
      for (const path of ["/api/faculty", "/api/subjects"]) expect(text(await call("facA", "get", path))).not.toContain("BRAVO");
      expect((await call("facA", "post", "/api/session-logs", { subjectId: ids.suba, heldOn: "2026-09-14", timetableEntryId: ids.slota, outcome: "CANCELLED", notes: "own subject leave" })).status).toBe(201); // own subject still works
      expect(await bravoSnapshot()).toBe(snap);
    });

    it("students cannot mutate anything, on their own campus or another", async () => {
      const before = await totals(), snap = await bravoSnapshot();
      const targets: Array<["post" | "patch" | "put" | "delete", string, object?]> = [
        ["post", "/api/faculty", { name: "X", campusId: A }], ["post", "/api/batches", { name: "X", semesterId: ids.sema }], ["post", "/api/subjects", { code: "S9", name: "X", batchId: ids.batcha }],
        ["post", "/api/timetable", { subjectId: ids.suba, weekday: 5, startTime: "09:00", endTime: "10:00" }], ["post", "/api/exams", { name: "X", type: "SESSIONAL", semesterId: ids.sema, startsOn: "2026-11-02", endsOn: "2026-11-03" }],
        ["post", "/api/calendar/entries", { title: "X", category: "EVENT", startsOn: "2026-11-03", campusId: A }], ["post", "/api/session-logs", { subjectId: ids.suba, heldOn: "2026-09-14", outcome: "CANCELLED", notes: "hack attempt" }],
        ["patch", `/api/subjects/${ids.suba}`, { name: "HACKED" }], ["delete", `/api/timetable/${ids.slota}`], ["put", `/api/subjects/${ids.suba}/syllabus`, { units: [] }], ["post", `/api/session-logs/${ids.loga}/review`, { note: "x" }],
        ["patch", `/api/subjects/${ids.subb}`, { name: "HACKED" }], ["delete", `/api/exams/${ids.examb}`],
      ];
      for (const [method, path, body] of targets) expect([403, 404], `${method} ${path}`).toContain((await call("stuA", method, path, body)).status);
      expect(await totals()).toBe(before); expect(await bravoSnapshot()).toBe(snap);
    });
  });

  /* ------------------------------------------------------------------ */
  describe("identity, spoofing and fail-closed membership", () => {
    it("anonymous callers are rejected everywhere except health and sign-in", async () => {
      for (const path of ["/api/dashboard", "/api/semesters", "/api/subjects", "/api/subjects/export.csv?semesterId=x", "/api/calendar/export.csv?campusId=rgib", "/api/session-logs/schedule?date=2026-10-05&campusId=rgib", "/api/student/portal", "/api/reports?type=course_progress"]) {
        expect((await call("anon", "get", path)).status, path).toBe(401);
      }
      expect((await call("anon", "post", "/api/faculty", { name: "x", campusId: A })).status).toBe(401);
      expect((await call("anon", "get", "/api/health")).status).toBe(200);
      expect((await call("anon", "get", "/api/meta")).status).toBe(401); // campus list is not public
    });

    it("spoofed role, campus, faculty and batch headers grant nothing when a session exists or demo headers are off", async () => {
      const snap = await bravoSnapshot();
      const spoof = { "X-Demo-Role": "admin", "X-Demo-Campus": B, "X-Demo-Faculty": ids.facb!, "X-Demo-Batch": ids.batchb! };
      const withSpoof = (who: string, method: "get" | "post", path: string, body?: object) => { let t = as(who)(request(prod)[method](path)); for (const [k, v] of Object.entries(spoof)) t = t.set(k, v); return body ? t.send(body) : t; };
      expect((await withSpoof("mgrA", "get", `/api/subjects?campusId=${B}`)).status).toBe(403);
      expect(text(await withSpoof("mgrA", "get", "/api/subjects"))).not.toContain("BRAVO");
      expect((await withSpoof("stuA", "get", "/api/student/portal")).body.batch.name).toBe("ALPHA Batch");
      expect((await withSpoof("stuA", "post", "/api/faculty", { name: "x", campusId: B })).status).toBe(403);
      expect((await withSpoof("anon", "get", "/api/subjects")).status).toBe(401);
      expect((await withSpoof("anon", "post", "/api/faculty", { name: "x", campusId: B })).status).toBe(401);
      expect(await bravoSnapshot()).toBe(snap);
    });

    it("missing or unresolvable campus membership fails closed: signed in, but nothing is readable or writable", async () => {
      for (const who of ["mgrNone", "facGhost", "facUnlinked", "stuNone", "stuGhost"]) {
        for (const [method, path, body] of [["get", "/api/dashboard"], ["get", "/api/subjects"], ["get", `/api/semesters?campusId=${A}`], ["get", "/api/student/portal"], ["post", "/api/faculty", { name: "x", campusId: A }], ["get", "/api/subjects/export.csv?semesterId=x"]] as const) {
          const res = await call(who, method, path, body as object | undefined);
          expect(res.status, `${who} ${method} ${path}`).toBe(403);
          expect(res.body.error).toBe("no_campus_assigned");
        }
        expect((await call(who, "get", "/api/meta")).status).toBe(403); // no campus, no campus list
        expect((await call(who, "get", "/api/auth/session")).body.user.email).toBe(`${who}@t.test`.toLowerCase()); // accounts store lower-case emails
      }
    });

    it("rejects account configuration that names an unknown campus (nobody gets access by typo)", () => {
      const bad = JSON.stringify([{ email: "m@t.test", role: "campus_manager", campusIds: ["atlantis"], passwordHash: hashPassword("pw-pw-pw-pw-pw") }]);
      expect(() => createAuth({ AUTH_USERS: bad, SESSION_SECRET: "s".repeat(40) })).toThrow(/known campus ids/);
    });

    it("development demo mode never becomes unrestricted by omission: a preview is ONE campus (named, or the configured default); '*' is an explicit opt-in; invalid fails closed", async () => {
      const get = (app: ReturnType<typeof createApp>, path: string, role: string | null, campus?: string) => { let t = request(app).get(path); if (role) t = t.set("X-Demo-Role", role); if (campus !== undefined) t = t.set("X-Demo-Campus", campus); return t; };
      // named campus: scoped, and switching changes what is visible
      const onA = await get(dev, "/api/subjects", "campus_manager", A); expect(text(onA)).toContain("ALPHA"); expect(text(onA)).not.toContain("BRAVO");
      const onB = await get(dev, "/api/subjects", "campus_manager", B); expect(text(onB)).toContain("BRAVO"); expect(text(onB)).not.toContain("ALPHA");
      expect((await get(dev, `/api/subjects?campusId=${B}`, "campus_manager", A)).status).toBe(403);
      // no campus selected: the default campus only (hi-tech here, which holds none of this test's data) — not everything
      const none = await get(dev, "/api/subjects", "admin"); expect(none.status).toBe(200); expect(text(none)).not.toContain("ALPHA"); expect(text(none)).not.toContain("BRAVO");
      expect((await get(dev, `/api/subjects?campusId=${A}`, "admin")).status).toBe(403); // even a demo "admin" must select the campus first
      // the configured default is a single campus too
      const dev2 = createApp({ CORS_ORIGIN: "http://localhost:5173", DEMO_DEFAULT_CAMPUS: A }, db, () => clock);
      const viaDefault = await get(dev2, "/api/subjects", "admin"); expect(text(viaDefault)).toContain("ALPHA"); expect(text(viaDefault)).not.toContain("BRAVO");
      // explicit all-campus preview must be asked for
      const star = await get(dev, "/api/subjects", "admin", "*"); expect(text(star)).toContain("ALPHA"); expect(text(star)).toContain("BRAVO");
      // invalid selection fails closed
      const bad = await get(dev, "/api/subjects", "admin", "atlantis"); expect(bad.status).toBe(403); expect(bad.body.error).toBe("no_campus_assigned");
      // anonymous development callers (no role at all) get the same single-campus default, not everything
      const anon = await get(dev, "/api/subjects", null); expect(anon.status).toBe(200); expect(text(anon)).not.toContain("ALPHA"); expect(text(anon)).not.toContain("BRAVO");
      // demo scope applies to writes too
      expect((await request(dev).post("/api/faculty").set("X-Demo-Role", "campus_manager").set("X-Demo-Campus", A).send({ name: "x", campusId: B })).status).toBe(403);
    });

    it("demo headers never override a real session: role, campus, faculty and batch all come from the account", async () => {
      const res = await request(prod).get("/api/subjects").set("Cookie", cookies.stuA!).set("X-Demo-Role", "admin").set("X-Demo-Campus", "*").set("X-Demo-Faculty", ids.facb!).set("X-Demo-Batch", ids.batchb!);
      expect(res.status).toBe(200); expect(text(res)).not.toContain("BRAVO");
      expect((await request(prod).post("/api/faculty").set("Cookie", cookies.stuA!).set("X-Demo-Role", "admin").set("X-Demo-Campus", "*").send({ name: "x", campusId: B })).status).toBe(403);
    });

    it("existing behaviour is intact: logout revokes, the student portal and carry-forward work inside the caller's campus, readiness and progression numbers are unchanged", async () => {
      const c = cookies.mgrB!;
      expect((await request(prod).post("/api/auth/logout").set("Cookie", c)).status).toBe(204);
      expect((await request(prod).get("/api/subjects").set("Cookie", c)).status).toBe(401);
      const cf = await call("facA", "get", `/api/session-logs/carry-forward?subjectId=${ids.suba}&heldOn=2026-09-14`);
      expect(cf.status).toBe(200); expect(cf.body.source).not.toBeNull();
      const prog = await call("mgrA", "get", `/api/progression/subjects/${ids.suba}`);
      expect(prog.body.progress.coveragePct).toBe(100);
      const er = await call("mgrA", "get", `/api/exam-readiness?campusId=${A}`);
      expect(er.body.exams[0].name).toBe("ALPHA Exam");
    });
  });
});
