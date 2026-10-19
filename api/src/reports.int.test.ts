/**
 * Integration tests (real PostgreSQL, TEST_DATABASE_URL) for Academic Intelligence & Reports (Phase 11).
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDatabase, type Database } from "./db/client.js";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("Academic Intelligence & Reports API (PostgreSQL)", () => {
  let db: Database;
  let app: ReturnType<typeof createApp>;
  const clock = new Date("2026-10-05T08:00:00Z"); // 13:30 IST -> today = 2026-10-05
  const ids: Record<string, string> = {};
  const T: string[] = [];

  const admin = (t: request.Test) => t.set("X-Demo-Role", "admin");
  const manager = (t: request.Test) => t.set("X-Demo-Role", "campus_manager");
  const faculty = (t: request.Test, facultyId?: string) => {
    let req = t.set("X-Demo-Role", "faculty");
    if (facultyId) req = req.set("X-Demo-Faculty", facultyId);
    return req;
  };
  const student = (t: request.Test) => t.set("X-Demo-Role", "student");
  const post = async (path: string, body: object, role = manager) => (await role(request(app).post(path)).send(body)).body;

  beforeAll(async () => {
    execSync("npx prisma migrate deploy", {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    db = createDatabase(url);
    await db.prisma!.$executeRawUnsafe(
      `TRUNCATE "SessionTopicEntry","SessionLogRevision","SessionLog","Exam","CalendarEntry","TimetableEntry","SyllabusTopic","SyllabusUnit","Subject","Batch","Faculty","Semester" RESTART IDENTITY CASCADE`,
    );
    app = createApp({ CORS_ORIGIN: "http://localhost:5173" }, db, () => clock);

    // 1. Setup semester and batch on rgib
    ids.sem = (
      await post(
        "/api/semesters",
        {
          name: "Sem 1",
          academicYear: "2026-27",
          track: "MIRAI",
          campusId: "rgib",
          startsOn: "2026-09-07",
          endsOn: "2026-12-18",
          saturdayRule: "NONE",
        },
        admin,
      )
    ).id;
    await admin(request(app).post(`/api/semesters/${ids.sem}/activate`)).send({});

    ids.batchA = (await post("/api/batches", { name: "Batch A", semesterId: ids.sem })).id;
    ids.f1 = (await post("/api/faculty", { name: "Dr. Bose", campusId: "rgib" })).id;
    ids.s1 = (
      await post("/api/subjects", {
        code: "=PHYS101", // test formula injection prevention
        name: "Quantum Mechanics",
        batchId: ids.batchA,
        facultyId: ids.f1,
        plannedHours: 16,
      })
    ).id;

    // Syllabus
    const syl = await manager(request(app).put(`/api/subjects/${ids.s1}/syllabus`)).send({
      units: [
        {
          title: "Unit 1",
          topics: [
            { title: "T1 Intro", plannedHours: 4, examScope: "MID_TERM" },
            { title: "T2 Wave Equation", plannedHours: 4, examScope: "MID_TERM" },
          ],
        },
        {
          title: "Unit 2",
          topics: [
            { title: "T3 Operators", plannedHours: 4, examScope: "END_TERM" },
            { title: "T4 Uncertainty", plannedHours: 4 },
          ],
        },
      ],
    });
    T.push(...syl.body.units.flatMap((u: { topics: Array<{ id: string }> }) => u.topics.map((t) => t.id)));

    // Timetable: Mon 09:00-10:00 (1h) + Wed 09:00-10:30 (1.5h)
    ids.mon = (await post("/api/timetable", { subjectId: ids.s1, weekday: 1, startTime: "09:00", endTime: "10:00" })).id;
    ids.wed = (await post("/api/timetable", { subjectId: ids.s1, weekday: 3, startTime: "09:00", endTime: "10:30" })).id;

    // Exam: Mid-term starting Mon 26 Oct
    ids.midTerm = (
      await post("/api/exams", {
        name: "Mid-Term",
        type: "MID_TERM",
        semesterId: ids.sem,
        startsOn: "2026-10-26",
        endsOn: "2026-10-30",
      })
    ).id;

    // Log a completed class on Mon 21 Sep (1h) covering T1 100%
    await manager(request(app).post("/api/session-logs")).send({
      subjectId: ids.s1,
      heldOn: "2026-09-21",
      timetableEntryId: ids.mon,
      outcome: "COMPLETED",
      actualHours: 1.0,
      covered: [{ topicId: T[0]!, completionPct: 100 }],
    });

    // Log a cancelled class on Mon 28 Sep
    await manager(request(app).post("/api/session-logs")).send({
      subjectId: ids.s1,
      heldOn: "2026-09-28",
      timetableEntryId: ids.mon,
      outcome: "CANCELLED",
      notes: "Campus holiday announcement",
    });
  });

  afterAll(async () => {
    await db.prisma?.$disconnect();
  });

  it("Course Progress Report returns filtered subject progression with summary totals", async () => {
    const res = await admin(request(app).get("/api/reports?type=course_progress&campusId=rgib"));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("course_progress");
    expect(res.body.courseProgress).toBeDefined();

    const { items, summary } = res.body.courseProgress;
    expect(items).toHaveLength(1);
    expect(items[0].code).toBe("=PHYS101");
    expect(items[0].name).toBe("Quantum Mechanics");
    expect(items[0].hoursInScope).toBe(16);
    expect(items[0].coveredHours).toBe(4);
    expect(items[0].remainingHours).toBe(12);

    expect(summary.totalSubjects).toBe(1);
    expect(summary.totalHoursInScope).toBe(16);
    expect(summary.totalCoveredHours).toBe(4);
    expect(summary.totalRemainingHours).toBe(12);
    expect(summary.aggregateCoveragePct).toBe(25.0);
    expect(summary.overallStatus).toBe(items[0].status);
  });

  it("Teaching Delivery Report calculates counts, unlogged sessions, and delivery rates", async () => {
    const res = await admin(request(app).get("/api/reports?type=teaching_delivery&campusId=rgib"));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("teaching_delivery");
    expect(res.body.teachingDelivery).toBeDefined();

    const { items, summary } = res.body.teachingDelivery;
    expect(items).toHaveLength(1);
    const item = items[0];

    expect(item.completed).toBe(1);
    expect(item.cancelled).toBe(1);
    expect(item.actualHours).toBe(1.0);
    expect(item.totalScheduled).toBeGreaterThan(0);
    expect(summary.totalCompleted).toBe(1);
    expect(summary.totalCancelled).toBe(1);
    expect(summary.totalActualHours).toBe(1.0);
  });

  it("Faculty Activity Report gives per-faculty delivery and review metrics", async () => {
    const res = await admin(request(app).get("/api/reports?type=faculty_activity&campusId=rgib"));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("faculty_activity");
    expect(res.body.facultyActivity).toBeDefined();

    const { items, summary } = res.body.facultyActivity;
    expect(items).toHaveLength(1);
    const f = items[0];
    expect(f.facultyName).toBe("Dr. Bose");
    expect(f.totalLogs).toBe(2); // 1 completed + 1 cancelled
    expect(f.completedLogs).toBe(1);
    expect(f.cancelledLogs).toBe(1);
    expect(f.hoursTaught).toBe(1.0);
    expect(f.pendingReviewLogs).toBe(2);
    expect(summary.totalFaculty).toBe(1);
    expect(summary.totalLogs).toBe(2);
  });

  it("Faculty role is scoped strictly to their own identity and denied without X-Demo-Faculty", async () => {
    // Missing X-Demo-Faculty header -> 403 faculty_identity_required
    const unauth = await faculty(request(app).get("/api/reports?type=course_progress&campusId=rgib"));
    expect(unauth.status).toBe(403);
    expect(unauth.body.error).toBe("faculty_identity_required");

    // With X-Demo-Faculty header -> success, scoped to Dr. Bose (ids.f1)
    const authed = await faculty(request(app).get("/api/reports?type=course_progress&campusId=rgib"), ids.f1);
    expect(authed.status).toBe(200);
    expect(authed.body.courseProgress.items).toHaveLength(1);
    expect(authed.body.courseProgress.items[0].facultyId).toBe(ids.f1);

    // Another faculty member with no assigned subjects cannot see Dr. Bose's subjects or exams
    ids.f2 = (await post("/api/faculty", { name: "Prof. Raman", campusId: "rgib" })).id;
    const f2Progress = await faculty(request(app).get("/api/reports?type=course_progress&campusId=rgib"), ids.f2);
    expect(f2Progress.status).toBe(200);
    expect(f2Progress.body.courseProgress.items).toHaveLength(0);

    const f2Readiness = await faculty(request(app).get("/api/reports?type=exam_readiness&campusId=rgib"), ids.f2);
    expect(f2Readiness.status).toBe(200);
    expect(f2Readiness.body.examReadiness.items).toHaveLength(0);

    const f2CampusTrack = await faculty(request(app).get("/api/reports?type=campus_track&campusId=rgib"), ids.f2);
    expect(f2CampusTrack.status).toBe(200);
    expect(f2CampusTrack.body.campusTrack.items).toHaveLength(0);
  });

  it("Exam Readiness Report details subjects at risk and teaching capacity before exams", async () => {
    const res = await admin(request(app).get("/api/reports?type=exam_readiness&campusId=rgib"));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("exam_readiness");
    expect(res.body.examReadiness).toBeDefined();

    const { items, summary } = res.body.examReadiness;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].examName).toBe("Mid-Term");
    expect(items[0].name).toBe("Quantum Mechanics");
    expect(summary.totalExams).toBeGreaterThanOrEqual(1);

    // Querying without campusId evaluates across all campuses cleanly without crashing
    const allRes = await admin(request(app).get("/api/reports?type=exam_readiness"));
    expect(allRes.status).toBe(200);
    expect(allRes.body.examReadiness.items.length).toBeGreaterThanOrEqual(1);
  });

  it("Campus & Track Summary Report provides cross-track comparisons with worst-status rollup", async () => {
    const res = await admin(request(app).get("/api/reports?type=campus_track&campusId=rgib"));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("campus_track");
    expect(res.body.campusTrack).toBeDefined();

    const { items, summary } = res.body.campusTrack;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].campusId).toBe("rgib");
    expect(items[0].track).toBe("MIRAI");
    expect(items[0].totalSubjects).toBe(1);
    expect(summary.totalCampuses).toBe(1);
    expect(summary.totalSubjects).toBe(1);
    expect(summary.institutionalStatus).toBe(items[0].overallStatus);
  });

  it("CSV Export returns RFC 4180 format with formula injection protection and attachment header", async () => {
    const res = await admin(request(app).get("/api/reports/export?type=course_progress&campusId=rgib&format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment; filename=\"prospectus-course_progress-");

    const text = res.text;
    expect(text).toContain("Subject Code,Subject Name");
    // '=PHYS101' was escaped with a leading single quote to prevent formula execution in Excel/Sheets
    expect(text).toContain("'=PHYS101");
    expect(text).toContain("TOTAL / OVERALL");
  });

  it("Student role is strictly forbidden from viewing or exporting reports", async () => {
    const resGet = await student(request(app).get("/api/reports?type=course_progress&campusId=rgib"));
    expect(resGet.status).toBe(403);
    expect(resGet.body.error).toBe("forbidden");

    const resExport = await student(request(app).get("/api/reports/export?type=course_progress&campusId=rgib&format=csv"));
    expect(resExport.status).toBe(403);
    expect(resExport.body.error).toBe("forbidden");
  });
});
