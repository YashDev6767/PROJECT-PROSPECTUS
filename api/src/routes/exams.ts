import { Router, type Response } from "express";
import { z } from "zod";
import { toCsv } from "../domain/csv.js";
import { examTypeLabels, findExamOverlaps, validateExamDates } from "../domain/exams.js";
import { asyncHandler, failOnIssues, HttpError, needDb, needsConfirmation, notFound, parse, requireCapability } from "../http/errors.js";
import { campusId, examCreate, examUpdate, track } from "../http/schemas.js";
import { dbDate, iso } from "../services/format.js";
import type { Prisma } from "@prisma/client";
import { and, audienceOf, campusWhere, examAudience, hideOutOfScope, inScope, scopeOf } from "../http/scope.js";
import type { Deps } from "./deps.js";

const include = { semester: true, batch: true } as const;
type Row = { id: string; name: string; type: "SESSIONAL" | "MID_TERM" | "PUT" | "END_TERM"; semesterId: string; batchId: string | null; startsOn: Date; endsOn: Date; notes: string | null; isSample: boolean; semester: { name: string; campusId: string; track: "MIRAI" | "UNIVERSITY" }; batch: { name: string } | null };

// campus and track are derived from the semester, never stored on the exam.
export const serializeExam = (e: Row) => ({
  id: e.id, name: e.name, type: e.type, typeLabel: examTypeLabels[e.type],
  semesterId: e.semesterId, semesterName: e.semester.name, campusId: e.semester.campusId, track: e.semester.track,
  batchId: e.batchId, batchName: e.batch?.name ?? null, startsOn: iso(e.startsOn), endsOn: iso(e.endsOn), notes: e.notes, isSample: e.isSample,
});

export function examsRouter({ db }: Deps): Router {
  const r = Router();
  const query = z.object({ campusId: campusId.optional(), track: track.optional(), semesterId: z.string().max(64).optional() });

  async function validateAndWarn(res: Response, prisma: NonNullable<Deps["db"]["prisma"]>, e: { id?: string; semesterId: string; batchId: string | null; startsOn: string; endsOn: string }, confirm: boolean | undefined) {
    const semester = await prisma.semester.findUnique({ where: { id: e.semesterId } });
    if (!semester || !inScope(scopeOf(res), semester.campusId)) throw new HttpError(400, "validation_failed", "The request has invalid fields", { issues: [{ path: "semesterId", message: "Semester not found" }] });
    if (e.batchId) {
      const batch = await prisma.batch.findUnique({ where: { id: e.batchId } });
      if (!batch || batch.semesterId !== semester.id) throw new HttpError(400, "validation_failed", "The request has invalid fields", { issues: [{ path: "batchId", message: "Batch does not belong to this semester" }] });
    }
    failOnIssues(validateExamDates(e, { startsOn: iso(semester.startsOn), endsOn: iso(semester.endsOn) }).map((message) => ({ path: "startsOn", message })));
    const others = await prisma.exam.findMany({ where: { semesterId: semester.id }, include });
    const hits = findExamOverlaps({ ...e, batchId: e.batchId }, others.map((o) => ({ id: o.id, name: o.name, semesterId: o.semesterId, batchId: o.batchId, startsOn: iso(o.startsOn), endsOn: iso(o.endsOn) })));
    if (hits.length && !confirm) {
      throw needsConfirmation(hits.map((h) => ({ code: "exam_overlap", message: `Overlaps "${h.name}" (${h.startsOn} to ${h.endsOn}).` })));
    }
  }

  r.get("/exams", asyncHandler(async (req, res) => {
    const q = parse(query, req.query);
    const prisma = needDb(db);
    const rows = await prisma.exam.findMany({
      where: and<Prisma.ExamWhereInput>({ semesterId: q.semesterId, semester: { campusId: campusWhere(res, q.campusId), track: q.track } }, examAudience(audienceOf(res))),
      include, orderBy: [{ startsOn: "asc" }, { name: "asc" }],
    });
    res.json({ exams: rows.map(serializeExam) });
  }));

  r.get("/exams/export.csv", asyncHandler(async (req, res) => {
    const q = parse(query, req.query);
    const prisma = needDb(db);
    const rows = await prisma.exam.findMany({ where: and<Prisma.ExamWhereInput>({ semesterId: q.semesterId, semester: { campusId: campusWhere(res, q.campusId), track: q.track } }, examAudience(audienceOf(res))), include, orderBy: [{ startsOn: "asc" }] });
    res.type("text/csv").attachment("exams.csv").send(toCsv(
      ["name", "type", "semester", "campus", "track", "batch", "start_date", "end_date", "notes", "sample_data"],
      rows.map(serializeExam).map((e) => [e.name, e.type, e.semesterName, e.campusId, e.track, e.batchName, e.startsOn, e.endsOn, e.notes, e.isSample ? "yes" : "no"]),
    ));
  }));

  r.post("/exams", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const b = parse(examCreate, req.body);
    const prisma = needDb(db);
    await validateAndWarn(res, prisma, b, b.confirmOverlap);
    const created = await prisma.exam.create({ data: { name: b.name, type: b.type, semesterId: b.semesterId, batchId: b.batchId, startsOn: dbDate(b.startsOn), endsOn: dbDate(b.endsOn), notes: b.notes }, include });
    res.status(201).json(serializeExam(created));
  }));

  r.patch("/exams/:id", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const b = parse(examUpdate, req.body);
    const prisma = needDb(db);
    const current = await prisma.exam.findUnique({ where: { id: req.params.id }, include: { semester: true } });
    if (!current) throw notFound("Exam");
    hideOutOfScope(res, current.semester.campusId, "Exam");
    const next = {
      id: current.id, semesterId: current.semesterId, name: b.name ?? current.name, type: b.type ?? current.type,
      batchId: b.batchId === undefined ? current.batchId : b.batchId,
      startsOn: b.startsOn ?? iso(current.startsOn), endsOn: b.endsOn ?? iso(current.endsOn),
      notes: b.notes === undefined ? current.notes : b.notes,
    };
    await validateAndWarn(res, prisma, next, b.confirmOverlap);
    const updated = await prisma.exam.update({ where: { id: current.id }, data: { name: next.name, type: next.type, batchId: next.batchId, startsOn: dbDate(next.startsOn), endsOn: dbDate(next.endsOn), notes: next.notes }, include });
    res.json(serializeExam(updated));
  }));

  r.delete("/exams/:id", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const prisma = needDb(db);
    const current = await prisma.exam.findUnique({ where: { id: req.params.id }, include: { semester: true } });
    if (!current) throw notFound("Exam");
    hideOutOfScope(res, current.semester.campusId, "Exam");
    await prisma.exam.delete({ where: { id: current.id } });
    res.status(204).end();
  }));

  return r;
}
