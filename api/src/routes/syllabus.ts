import { Router, type Response } from "express";
import { parseSyllabusCsv, syllabusToCsv, totalPlannedHours, validateSyllabus } from "../domain/syllabus.js";
import { asyncHandler, failOnIssues, HttpError, needDb, needsConfirmation, notFound, parse, requireCapability } from "../http/errors.js";
import { csvBody, syllabusBody } from "../http/schemas.js";
import { loadSyllabus, matchExistingIds, saveSyllabus } from "../services/syllabusData.js";
import type { Deps } from "./deps.js";
import { hideOutOfScope, hideUnlessAudience } from "../http/scope.js";

export function syllabusRouter({ db }: Deps): Router {
  const r = Router();

  async function subjectOr404(res: Response, prisma: NonNullable<Deps["db"]["prisma"]>, id: string) {
    const s = await prisma.subject.findUnique({ where: { id }, include: { batch: { include: { semester: true } } } });
    if (!s) throw notFound("Subject");
    hideOutOfScope(res, s.batch.semester.campusId, "Subject"); // every syllabus route (read, write, import, export) goes through here
    hideUnlessAudience(res, s, "Subject"); // faculty: assigned subjects only; students: their batch only
    return s;
  }
  const payload = async (prisma: NonNullable<Deps["db"]["prisma"]>, s: { id: string; code: string; name: string; plannedHours: number | null; isSample: boolean; batch: { name: string } }) => {
    const units = await loadSyllabus(prisma, s.id);
    return { subject: { id: s.id, code: s.code, name: s.name, batchName: s.batch.name, plannedHours: s.plannedHours, isSample: s.isSample }, units, totalPlannedHours: totalPlannedHours(units) };
  };

  r.get("/subjects/:id/syllabus", asyncHandler(async (req, res) => {
    const prisma = needDb(db);
    res.json(await payload(prisma, await subjectOr404(res, prisma, req.params.id!)));
  }));

  r.put("/subjects/:id/syllabus", requireCapability("syllabus:write"), asyncHandler(async (req, res) => {
    const b = parse(syllabusBody, req.body);
    failOnIssues(validateSyllabus(b.units).map((i) => ({ path: `${i.field}`, message: i.message })));
    const prisma = needDb(db);
    const s = await subjectOr404(res, prisma, req.params.id!);
    await saveSyllabus(prisma, s.id, b.units);
    res.json(await payload(prisma, s));
  }));

  r.get("/subjects/:id/syllabus/export.csv", asyncHandler(async (req, res) => {
    const prisma = needDb(db);
    const s = await subjectOr404(res, prisma, req.params.id!);
    res.type("text/csv").attachment(`syllabus-${s.code}.csv`).send(syllabusToCsv(await loadSyllabus(prisma, s.id)));
  }));

  // Preview never writes. Row-level errors are returned for every bad row.
  r.post("/subjects/:id/syllabus/import/preview", requireCapability("syllabus:write"), asyncHandler(async (req, res) => {
    const b = parse(csvBody, req.body);
    const prisma = needDb(db);
    const s = await subjectOr404(res, prisma, req.params.id!);
    const result = parseSyllabusCsv(b.csv);
    const existing = await prisma.syllabusTopic.count({ where: { unit: { subjectId: s.id } } });
    res.json({ valid: result.errors.length === 0, rowCount: result.rowCount, errors: result.errors, units: result.units, totalPlannedHours: totalPlannedHours(result.units), existingTopicCount: existing });
  }));

  r.post("/subjects/:id/syllabus/import", requireCapability("syllabus:write"), asyncHandler(async (req, res) => {
    const b = parse(csvBody, req.body);
    const prisma = needDb(db);
    const s = await subjectOr404(res, prisma, req.params.id!);
    const result = parseSyllabusCsv(b.csv);
    if (result.errors.length) throw new HttpError(400, "import_invalid", `The file has ${result.errors.length} invalid row(s); nothing was imported.`, { errors: result.errors });
    const existing = await prisma.syllabusTopic.count({ where: { unit: { subjectId: s.id } } });
    if (existing > 0 && !b.confirmReplace) {
      throw needsConfirmation([{ code: "will_replace_syllabus", message: `Importing replaces the current syllabus (${existing} topic(s)). Topics that match by title keep their identity; others are removed.` }]);
    }
    await saveSyllabus(prisma, s.id, await matchExistingIds(prisma, s.id, result.units));
    res.json(await payload(prisma, s));
  }));

  return r;
}
