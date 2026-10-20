import { Router } from "express";
import { z } from "zod";
import { findSemesterOverlaps, semesterStatus } from "../domain/semesters.js";
import { asyncHandler, failOnIssues, HttpError, inUse, needDb, needsConfirmation, notFound, parse, requireCapability } from "../http/errors.js";
import { campusId, confirmBody, semesterCreate, semesterIssues, semesterUpdate, track } from "../http/schemas.js";
import { dbDate, iso } from "../services/format.js";
import type { Prisma } from "@prisma/client";
import { and, assertCampus, audienceOf, batchAudience, campusWhere, examAudience, hideOutOfScope, semesterAudience } from "../http/scope.js";
import type { Deps } from "./deps.js";

type Row = { id: string; name: string; academicYear: string; track: "MIRAI" | "UNIVERSITY"; campusId: string; startsOn: Date; endsOn: Date; saturdayRule: "ALL" | "NONE" | "SECOND_FOURTH"; isActive: boolean; isSample: boolean; _count?: { batches: number; exams: number } };

export const serializeSemester = (s: Row, today: string) => ({
  id: s.id, name: s.name, academicYear: s.academicYear, track: s.track, campusId: s.campusId,
  startsOn: iso(s.startsOn), endsOn: iso(s.endsOn), saturdayRule: s.saturdayRule, isActive: s.isActive, isSample: s.isSample,
  status: semesterStatus({ startsOn: iso(s.startsOn), endsOn: iso(s.endsOn), isActive: s.isActive }, today),
  batchCount: s._count?.batches ?? 0, examCount: s._count?.exams ?? 0,
});

const range = (s: Row) => ({ id: s.id, name: s.name, campusId: s.campusId, track: s.track, startsOn: iso(s.startsOn), endsOn: iso(s.endsOn) });
const overlapWarnings = (hits: Array<{ name?: string; startsOn: string; endsOn: string }>) =>
  hits.map((h) => ({ code: "semester_overlap", message: `Overlaps "${h.name}" (${h.startsOn} to ${h.endsOn}) for the same campus and track.` }));

export function semestersRouter({ db, today: todayFn }: Deps): Router {
  const r = Router();
  const today = todayFn;
  const counts = { _count: { select: { batches: true, exams: true } } } as const;

  r.get("/semesters", asyncHandler(async (req, res) => {
    const q = parse(z.object({ campusId: campusId.optional(), track: track.optional() }), req.query);
    const prisma = needDb(db);
    const aud = audienceOf(res);
    const rows = await prisma.semester.findMany({
      where: and<Prisma.SemesterWhereInput>({ campusId: campusWhere(res, q.campusId), track: q.track }, semesterAudience(aud)),
      orderBy: [{ startsOn: "desc" }, { name: "asc" }],
      include: { _count: { select: { batches: { where: batchAudience(aud) ?? {} }, exams: { where: examAudience(aud) ?? {} } } } }, // counts never include what the caller may not see
    });
    res.json({ semesters: rows.map((s) => serializeSemester(s, today())) });
  }));

  r.post("/semesters", requireCapability("semesters:write"), asyncHandler(async (req, res) => {
    const b = parse(semesterCreate, req.body);
    failOnIssues(semesterIssues(b));
    assertCampus(res, b.campusId); // may not create a semester on a campus outside the account's scope
    const prisma = needDb(db);
    const siblings = await prisma.semester.findMany({ where: { campusId: b.campusId, track: b.track } });
    const hits = findSemesterOverlaps({ campusId: b.campusId, track: b.track, startsOn: b.startsOn, endsOn: b.endsOn }, siblings.map(range));
    if (hits.length && !b.confirmOverlap) throw needsConfirmation(overlapWarnings(hits));
    const created = await prisma.semester.create({
      data: { name: b.name, academicYear: b.academicYear, track: b.track, campusId: b.campusId, startsOn: dbDate(b.startsOn), endsOn: dbDate(b.endsOn), saturdayRule: b.saturdayRule },
      include: counts,
    });
    res.status(201).json(serializeSemester(created, today()));
  }));

  r.patch("/semesters/:id", requireCapability("semesters:write"), asyncHandler(async (req, res) => {
    const b = parse(semesterUpdate, req.body);
    const prisma = needDb(db);
    const current = await prisma.semester.findUnique({ where: { id: req.params.id }, include: counts });
    if (!current) throw notFound("Semester");
    hideOutOfScope(res, current.campusId, "Semester");
    if (b.campusId !== undefined) assertCampus(res, b.campusId); // nor move one onto another campus
    const merged = {
      name: b.name ?? current.name, academicYear: b.academicYear ?? current.academicYear, track: b.track ?? current.track,
      campusId: b.campusId ?? current.campusId, startsOn: b.startsOn ?? iso(current.startsOn), endsOn: b.endsOn ?? iso(current.endsOn),
      saturdayRule: b.saturdayRule ?? current.saturdayRule,
    };
    failOnIssues(semesterIssues(merged));

    const structural = merged.campusId !== current.campusId || merged.track !== current.track;
    if (structural && (current._count.batches > 0 || current._count.exams > 0)) {
      throw new HttpError(409, "in_use", "Campus and track cannot be changed once the semester has batches or exams.", { blockers: { batches: current._count.batches, exams: current._count.exams } });
    }
    const outside = await prisma.exam.count({ where: { semesterId: current.id, OR: [{ startsOn: { lt: dbDate(merged.startsOn) } }, { endsOn: { gt: dbDate(merged.endsOn) } }] } });
    if (outside > 0) throw new HttpError(409, "exams_outside_range", `${outside} exam(s) in this semester fall outside the new dates. Move or delete them first.`, { blockers: { exams: outside } });

    const siblings = await prisma.semester.findMany({ where: { campusId: merged.campusId, track: merged.track } });
    const hits = findSemesterOverlaps({ id: current.id, campusId: merged.campusId, track: merged.track, startsOn: merged.startsOn, endsOn: merged.endsOn }, siblings.map(range));
    if (hits.length && !b.confirmOverlap) throw needsConfirmation(overlapWarnings(hits));

    const updated = await prisma.semester.update({
      where: { id: current.id },
      data: { name: merged.name, academicYear: merged.academicYear, track: merged.track, campusId: merged.campusId, startsOn: dbDate(merged.startsOn), endsOn: dbDate(merged.endsOn), saturdayRule: merged.saturdayRule },
      include: counts,
    });
    res.json(serializeSemester(updated, today()));
  }));

  r.post("/semesters/:id/activate", requireCapability("semesters:write"), asyncHandler(async (req, res) => {
    const { confirm } = parse(confirmBody, req.body);
    const prisma = needDb(db);
    const sem = await prisma.semester.findUnique({ where: { id: req.params.id } });
    if (!sem) throw notFound("Semester");
    hideOutOfScope(res, sem.campusId, "Semester");
    if (iso(sem.endsOn) < today()) throw new HttpError(409, "semester_completed", "This semester has already ended and cannot be activated.");
    const others = await prisma.semester.findMany({ where: { campusId: sem.campusId, track: sem.track, isActive: true, id: { not: sem.id } } });
    if (others.length && !confirm) {
      throw needsConfirmation(others.map((o) => ({ code: "will_deactivate", message: `Activating "${sem.name}" will deactivate "${o.name}" for the same campus and track.` })));
    }
    const [, updated] = await prisma.$transaction([
      prisma.semester.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { isActive: false } }),
      prisma.semester.update({ where: { id: sem.id }, data: { isActive: true }, include: counts }),
    ]);
    res.json({ semester: serializeSemester(updated, today()), deactivated: others.map((o) => o.name) });
  }));

  r.post("/semesters/:id/deactivate", requireCapability("semesters:write"), asyncHandler(async (req, res) => {
    const prisma = needDb(db);
    const exists = await prisma.semester.findUnique({ where: { id: req.params.id } });
    if (!exists) throw notFound("Semester");
    hideOutOfScope(res, exists.campusId, "Semester");
    const updated = await prisma.semester.update({ where: { id: exists.id }, data: { isActive: false }, include: counts });
    res.json(serializeSemester(updated, today()));
  }));

  r.delete("/semesters/:id", requireCapability("semesters:write"), asyncHandler(async (req, res) => {
    const prisma = needDb(db);
    const sem = await prisma.semester.findUnique({ where: { id: req.params.id }, include: counts });
    if (!sem) throw notFound("Semester");
    hideOutOfScope(res, sem.campusId, "Semester");
    if (sem._count.batches || sem._count.exams) {
      throw inUse(`Cannot delete "${sem.name}": it still has ${sem._count.batches} batch(es) and ${sem._count.exams} exam(s). Remove those first.`, { batches: sem._count.batches, exams: sem._count.exams });
    }
    await prisma.semester.delete({ where: { id: sem.id } });
    res.status(204).end();
  }));

  return r;
}
