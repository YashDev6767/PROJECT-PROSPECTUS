import { Router } from "express";
import { z } from "zod";
import { toCsv } from "../domain/csv.js";
import { asyncHandler, HttpError, inUse, needDb, needsConfirmation, notFound, parse, requireCapability, validationFailed } from "../http/errors.js";
import { campusId, confirmQuery, subjectCreate, subjectUpdate, track } from "../http/schemas.js";
import { computeSubjectResult, loadSubjectContexts } from "../services/progressionData.js";
import type { Settings } from "../services/settings.js";
import { iso } from "../services/format.js";
import { checkSlotConflicts, slotContextFor } from "../services/timetableData.js";
import type { Deps } from "./deps.js";
import type { Prisma, PrismaClient } from "@prisma/client";
import { and, audienceOf, campusWhere, hideOutOfScope, inScope, scopeOf, subjectAudience } from "../http/scope.js";

const include = { batch: { include: { semester: true } }, faculty: true, timetable: true, units: { include: { topics: { select: { plannedHours: true } } } } } as const;
type SubjectRow = Awaited<ReturnType<typeof loadOne>>;
const loadOne = (prisma: PrismaClient, id: string) => prisma.subject.findUnique({ where: { id }, include });

async function serialize(prisma: PrismaClient, rows: NonNullable<SubjectRow>[], settings: Settings, today: string) {
  const contexts = await loadSubjectContexts(prisma, { id: { in: rows.map((r) => r.id) } });
  const byId = new Map(contexts.map((c) => [c.subject.id, computeSubjectResult(c, today, settings)]));
  return rows.map((s) => {
    const sem = s.batch.semester;
    const result = byId.get(s.id)!;
    const topics = s.units.flatMap((u) => u.topics);
    return {
      id: s.id, code: s.code, name: s.name, plannedHours: s.plannedHours, isSample: s.isSample,
      batchId: s.batchId, batchName: s.batch.name,
      semesterId: sem.id, semesterName: sem.name, campusId: sem.campusId, track: sem.track,
      facultyId: s.facultyId, facultyName: s.faculty?.name ?? null,
      // Derived, never stored:
      weeklyScheduledHours: result.weeklyHours,
      projectedSemesterHours: result.teachingCapacityHours, // timetable capacity from semester start to the last teaching day (holidays, Saturday rule and exam periods applied)
      syllabusPlannedHours: Math.round(topics.reduce((n, t) => n + t.plannedHours, 0) * 100) / 100,
      topicCount: topics.length,
      progress: { risk: result.progress.risk, headline: result.progress.headline, coveragePct: result.progress.coveragePct, bufferRatio: result.progress.bufferRatio, remainingHours: result.progress.remainingHours, availableHours: result.progress.availableHours, paceHours: result.progress.paceHours, overdueCount: result.progress.overdueTopics.length },
    };
  });
}

export function subjectsRouter({ db, settings, today }: Deps): Router {
  const r = Router();

  r.get("/subjects", asyncHandler(async (req, res) => {
    const q = parse(z.object({ campusId: campusId.optional(), track: track.optional(), semesterId: z.string().max(64).optional(), batchId: z.string().max(64).optional(), facultyId: z.string().max(64).optional() }), req.query);
    const prisma = needDb(db);
    const rows = await prisma.subject.findMany({
      where: and<Prisma.SubjectWhereInput>({ batchId: q.batchId, facultyId: q.facultyId, batch: { semesterId: q.semesterId, semester: { campusId: campusWhere(res, q.campusId), track: q.track } } }, subjectAudience(audienceOf(res))),
      include, orderBy: [{ batch: { name: "asc" } }, { code: "asc" }],
    });
    res.json({ subjects: await serialize(prisma, rows, settings, today()) });
  }));

  r.get("/subjects/export.csv", asyncHandler(async (req, res) => {
    const q = parse(z.object({ semesterId: z.string().max(64) }), req.query);
    const prisma = needDb(db);
    const rows = await serialize(prisma, await prisma.subject.findMany({ where: and<Prisma.SubjectWhereInput>({ batch: { semesterId: q.semesterId, semester: { campusId: campusWhere(res) } } }, subjectAudience(audienceOf(res))), include, orderBy: [{ batch: { name: "asc" } }, { code: "asc" }] }), settings, today());
    res.type("text/csv").attachment("subjects.csv").send(toCsv(
      ["code", "name", "batch", "faculty", "planned_hours", "weekly_scheduled_hours", "projected_semester_hours", "syllabus_hours", "sample_data"],
      rows.map((s) => [s.code, s.name, s.batchName, s.facultyName, s.plannedHours, s.weeklyScheduledHours, s.projectedSemesterHours, s.syllabusPlannedHours, s.isSample ? "yes" : "no"]),
    ));
  }));

  r.post("/subjects", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const b = parse(subjectCreate, req.body);
    const prisma = needDb(db);
    const batch = await prisma.batch.findUnique({ where: { id: b.batchId }, include: { semester: true } });
    if (!batch || !inScope(scopeOf(res), batch.semester.campusId)) throw validationFailed([{ path: "batchId", message: "Batch not found" }]);
    if (b.facultyId) {
      const f = await prisma.faculty.findUnique({ where: { id: b.facultyId } });
      if (!f || !inScope(scopeOf(res), f.campusId)) throw validationFailed([{ path: "facultyId", message: "Faculty member not found" }]);
      if (f.campusId !== batch.semester.campusId) throw validationFailed([{ path: "facultyId", message: `${f.name} belongs to a different campus than this batch` }]);
    }
    const created = await prisma.subject.create({ data: b, include });
    res.status(201).json((await serialize(prisma, [created], settings, today()))[0]);
  }));

  r.patch("/subjects/:id", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const b = parse(subjectUpdate, req.body);
    const prisma = needDb(db);
    const current = await loadOne(prisma, req.params.id!);
    if (!current) throw notFound("Subject");
    hideOutOfScope(res, current.batch.semester.campusId, "Subject");

    const batchId = b.batchId ?? current.batchId;
    const facultyId = b.facultyId === undefined ? current.facultyId : b.facultyId;
    const batch = batchId === current.batchId ? current.batch : await prisma.batch.findUnique({ where: { id: batchId }, include: { semester: true } });
    if (!batch || !inScope(scopeOf(res), batch.semester.campusId)) throw validationFailed([{ path: "batchId", message: "Batch not found" }]);
    if (batch.semesterId !== current.batch.semesterId) throw validationFailed([{ path: "batchId", message: "A subject can only move to another batch in the same semester" }]);
    const faculty = facultyId === null ? null : facultyId === current.facultyId ? current.faculty : await prisma.faculty.findUnique({ where: { id: facultyId } });
    if (facultyId !== null && (!faculty || !inScope(scopeOf(res), faculty.campusId))) throw validationFailed([{ path: "facultyId", message: "Faculty member not found" }]);
    if (faculty && faculty.campusId !== batch.semester.campusId) throw validationFailed([{ path: "facultyId", message: `${faculty.name} belongs to a different campus than this batch` }]);

    // Re-assigning a subject that already has timetable rows must not create clashes for the new batch/faculty.
    if ((batchId !== current.batchId || facultyId !== current.facultyId) && current.timetable.length) {
      const ctx = slotContextFor({ name: b.name ?? current.name, batchId, facultyId, batch, faculty });
      const conflicts = (await Promise.all(current.timetable.map((t) => checkSlotConflicts(prisma, ctx, { id: t.id, weekday: t.weekday, startTime: t.startTime, endTime: t.endTime })))).flat();
      if (conflicts.length) throw new HttpError(409, "timetable_conflict", "This assignment would clash with existing timetable entries.", { conflicts });
    }

    const updated = await prisma.subject.update({
      where: { id: current.id },
      data: { code: b.code, name: b.name, batchId, facultyId, plannedHours: b.plannedHours },
      include,
    });
    res.json((await serialize(prisma, [updated], settings, today()))[0]);
  }));

  r.delete("/subjects/:id", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const { confirm } = parse(confirmQuery, req.query);
    const prisma = needDb(db);
    const s = await prisma.subject.findUnique({ where: { id: req.params.id }, include: { batch: { include: { semester: true } }, _count: { select: { timetable: true, units: true, sessions: true } } } });
    if (!s) throw notFound("Subject");
    hideOutOfScope(res, s.batch.semester.campusId, "Subject");
    if (s._count.sessions) throw inUse(`Cannot delete "${s.name}": ${s._count.sessions} session log(s) exist for it.`, { sessions: s._count.sessions });
    if ((s._count.timetable || s._count.units) && confirm !== "true") {
      throw needsConfirmation([{ code: "will_delete_children", message: `Deleting "${s.name}" also deletes its ${s._count.units} syllabus unit(s) and ${s._count.timetable} timetable entr${s._count.timetable === 1 ? "y" : "ies"}.` }]);
    }
    await prisma.subject.delete({ where: { id: s.id } });
    res.status(204).end();
  }));

  return r;
}

