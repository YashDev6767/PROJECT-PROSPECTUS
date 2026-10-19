import { Router } from "express";
import { z } from "zod";
import { campuses } from "../data/campuses.js";
import { weeklyHours } from "../domain/timetable.js";
import { asyncHandler, HttpError, inUse, needDb, notFound, parse, requireCapability } from "../http/errors.js";
import { batchCreate, batchUpdate, campusId, facultyCreate, facultyUpdate, track } from "../http/schemas.js";
import { iso } from "../services/format.js";
import { assertCampus, campusWhere, hideOutOfScope, inScope, scopeOf } from "../http/scope.js";
import type { Deps } from "./deps.js";

const campusName = (id: string) => campuses.find((c) => c.id === id)?.name ?? id;
const batchInclude = { semester: true, _count: { select: { subjects: true, exams: true } } } as const;

type BatchRow = { id: string; name: string; semesterId: string; studentCount: number | null; isSample: boolean; semester: { name: string; campusId: string; track: "MIRAI" | "UNIVERSITY"; startsOn: Date; endsOn: Date }; _count: { subjects: number; exams: number } };
// campus and track are derived from the batch's semester.
export const serializeBatch = (b: BatchRow) => ({
  id: b.id, name: b.name, semesterId: b.semesterId, semesterName: b.semester.name, campusId: b.semester.campusId, campusName: campusName(b.semester.campusId),
  track: b.semester.track, studentCount: b.studentCount, subjectCount: b._count.subjects, examCount: b._count.exams, isSample: b.isSample,
});

export function peopleRouter({ db, today }: Deps): Router {
  const r = Router();

  /* ---------- batches ---------- */
  r.get("/batches", asyncHandler(async (req, res) => {
    const q = parse(z.object({ campusId: campusId.optional(), track: track.optional(), semesterId: z.string().max(64).optional() }), req.query);
    const prisma = needDb(db);
    const rows = await prisma.batch.findMany({ where: { semesterId: q.semesterId, semester: { campusId: campusWhere(res, q.campusId), track: q.track } }, include: batchInclude, orderBy: [{ semester: { startsOn: "desc" } }, { name: "asc" }] });
    res.json({ batches: rows.map(serializeBatch) });
  }));

  r.post("/batches", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const b = parse(batchCreate, req.body);
    const prisma = needDb(db);
    const sem = await prisma.semester.findUnique({ where: { id: b.semesterId } });
    if (!sem || !inScope(scopeOf(res), sem.campusId)) throw new HttpError(400, "validation_failed", "The request has invalid fields", { issues: [{ path: "semesterId", message: "Semester not found" }] });
    const created = await prisma.batch.create({ data: b, include: batchInclude });
    res.status(201).json(serializeBatch(created));
  }));

  r.patch("/batches/:id", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const b = parse(batchUpdate, req.body);
    const prisma = needDb(db);
    const existing = await prisma.batch.findUnique({ where: { id: req.params.id }, include: { semester: true } });
    if (!existing) throw notFound("Batch");
    hideOutOfScope(res, existing.semester.campusId, "Batch");
    const updated = await prisma.batch.update({ where: { id: req.params.id }, data: b, include: batchInclude });
    res.json(serializeBatch(updated));
  }));

  r.delete("/batches/:id", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const prisma = needDb(db);
    const batch = await prisma.batch.findUnique({ where: { id: req.params.id }, include: batchInclude });
    if (!batch) throw notFound("Batch");
    hideOutOfScope(res, batch.semester.campusId, "Batch");
    if (batch._count.subjects || batch._count.exams) {
      throw inUse(`Cannot delete "${batch.name}": it still has ${batch._count.subjects} subject(s) and ${batch._count.exams} exam(s). Remove or move those first.`, { subjects: batch._count.subjects, exams: batch._count.exams });
    }
    await prisma.batch.delete({ where: { id: batch.id } });
    res.status(204).end();
  }));

  /* ---------- faculty ---------- */
  const facultyInclude = { subjects: { include: { timetable: true, batch: { include: { semester: true } } } } } as const;
  const serializeFaculty = (f: { id: string; name: string; email: string | null; campusId: string; isSample: boolean; subjects: Array<{ batch: { semester: { startsOn: Date; endsOn: Date } }; timetable: Array<{ startTime: string; endTime: string }> }> }, today: string) => {
    // weekly hours are derived from timetable rows of subjects in semesters that have not ended
    const live = f.subjects.filter((s) => iso(s.batch.semester.endsOn) >= today);
    return { id: f.id, name: f.name, email: f.email, campusId: f.campusId, campusName: campusName(f.campusId), isSample: f.isSample, subjectCount: f.subjects.length, weeklyHours: weeklyHours(live.flatMap((s) => s.timetable)) };
  };

  r.get("/faculty", asyncHandler(async (req, res) => {
    const q = parse(z.object({ campusId: campusId.optional() }), req.query);
    const prisma = needDb(db);
    const rows = await prisma.faculty.findMany({ where: { campusId: campusWhere(res, q.campusId) }, include: facultyInclude, orderBy: { name: "asc" } });
    res.json({ faculty: rows.map((f) => serializeFaculty(f, today())) });
  }));

  r.post("/faculty", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const b = parse(facultyCreate, req.body);
    assertCampus(res, b.campusId);
    const prisma = needDb(db);
    const created = await prisma.faculty.create({ data: b, include: facultyInclude });
    res.status(201).json(serializeFaculty(created, today()));
  }));

  r.patch("/faculty/:id", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const b = parse(facultyUpdate, req.body);
    const prisma = needDb(db);
    const current = await prisma.faculty.findUnique({ where: { id: req.params.id }, include: { _count: { select: { subjects: true } } } });
    if (!current) throw notFound("Faculty member");
    hideOutOfScope(res, current.campusId, "Faculty member");
    if (b.campusId) assertCampus(res, b.campusId); // nor move a faculty member onto another campus
    if (b.campusId && b.campusId !== current.campusId && current._count.subjects > 0) {
      throw inUse(`${current.name} teaches ${current._count.subjects} subject(s); reassign them before moving to another campus.`, { subjects: current._count.subjects });
    }
    const updated = await prisma.faculty.update({ where: { id: current.id }, data: b, include: facultyInclude });
    res.json(serializeFaculty(updated, today()));
  }));

  r.delete("/faculty/:id", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const prisma = needDb(db);
    const f = await prisma.faculty.findUnique({ where: { id: req.params.id }, include: { _count: { select: { subjects: true } } } });
    if (!f) throw notFound("Faculty member");
    hideOutOfScope(res, f.campusId, "Faculty member");
    if (f._count.subjects) throw inUse(`Cannot delete ${f.name}: assigned to ${f._count.subjects} subject(s). Reassign those first.`, { subjects: f._count.subjects });
    await prisma.faculty.delete({ where: { id: f.id } });
    res.status(204).end();
  }));

  return r;
}
