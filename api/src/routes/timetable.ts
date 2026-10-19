import { Router, type Response } from "express";
import { z } from "zod";
import { toCsv } from "../domain/csv.js";
import { weekdayNames } from "../domain/dates.js";
import { slotHours } from "../domain/timetable.js";
import { asyncHandler, failOnIssues, HttpError, inUse, needDb, notFound, parse, requireCapability, validationFailed } from "../http/errors.js";
import { slotIssues, timetableCreate, timetableUpdate } from "../http/schemas.js";
import { checkSlotConflicts, slotContextFor } from "../services/timetableData.js";
import type { PrismaClient } from "@prisma/client";
import { occurrenceKey, occurrencesBetween } from "../domain/schedule.js";
import { iso } from "../services/format.js";
import { loadSubjectContexts, teachingContextFor } from "../services/progressionData.js";
import type { Deps } from "./deps.js";
import { campusWhere, hideOutOfScope, inScope, scopeOf } from "../http/scope.js";

const include = { subject: { include: { batch: { include: { semester: true } }, faculty: true } } } as const;
type Row = { id: string; weekday: number; startTime: string; endTime: string; room: string | null; subject: { id: string; code: string; name: string; isSample: boolean; batchId: string; facultyId: string | null; batch: { name: string }; faculty: { name: string } | null } };

// batch and faculty are derived from the subject; hours from the times.
const serialize = (e: Row) => ({
  id: e.id, subjectId: e.subject.id, subjectCode: e.subject.code, subjectName: e.subject.name,
  batchId: e.subject.batchId, batchName: e.subject.batch.name, facultyId: e.subject.facultyId, facultyName: e.subject.faculty?.name ?? null,
  weekday: e.weekday, weekdayName: weekdayNames[e.weekday], startTime: e.startTime, endTime: e.endTime, room: e.room,
  hours: slotHours(e.startTime, e.endTime), isSample: e.subject.isSample,
});

/** Adds planning facts derived from the engine: next planned date, logged count and past sessions still un-logged. */
async function withPlanning(prisma: PrismaClient, entries: Row[], todayIso: string) {
  const subjectIds = [...new Set(entries.map((e) => e.subject.id))];
  const contexts = new Map((await loadSubjectContexts(prisma, { id: { in: subjectIds } })).map((c) => [c.subject.id, c]));
  return entries.map((e) => {
    const base = serialize(e);
    const ctx = contexts.get(e.subject.id);
    if (!ctx) return { ...base, nextDate: null as string | null, loggedCount: 0, pastUnlogged: 0 };
    const sem = ctx.subject.batch.semester;
    const slot = { id: e.id, weekday: e.weekday, startTime: e.startTime, endTime: e.endTime };
    const occ = occurrencesBetween([slot], iso(sem.startsOn), iso(sem.endsOn), teachingContextFor(ctx));
    const logged = new Set(ctx.subject.sessions.filter((l) => l.timetableEntryId === e.id).map((l) => occurrenceKey(e.id, iso(l.heldOn))));
    return {
      ...base,
      nextDate: occ.find((o) => o.date >= todayIso && !logged.has(o.key))?.date ?? null,
      loggedCount: ctx.subject.sessions.filter((l) => l.timetableEntryId === e.id).length,
      pastUnlogged: occ.filter((o) => o.date < todayIso && !logged.has(o.key)).length,
    };
  });
}

export function timetableRouter({ db, today }: Deps): Router {
  const r = Router();
  const query = z.object({ semesterId: z.string().max(64).optional(), batchId: z.string().max(64).optional(), facultyId: z.string().max(64).optional() });
  const where = (res: Response, q: z.infer<typeof query>) => ({ subject: { facultyId: q.facultyId, batchId: q.batchId, batch: { semesterId: q.semesterId, semester: { campusId: campusWhere(res) } } } });
  const order = [{ weekday: "asc" as const }, { startTime: "asc" as const }];

  r.get("/timetable", asyncHandler(async (req, res) => {
    const q = parse(query, req.query);
    const prisma = needDb(db);
    const rows = await withPlanning(prisma, (await prisma.timetableEntry.findMany({ where: where(res, q), include, orderBy: order })), today());
    res.json({ entries: rows, totalWeeklyHours: Math.round(rows.reduce((n, e) => n + e.hours, 0) * 100) / 100 });
  }));

  r.get("/timetable/export.csv", asyncHandler(async (req, res) => {
    const q = parse(query, req.query);
    const prisma = needDb(db);
    const rows = (await prisma.timetableEntry.findMany({ where: where(res, q), include, orderBy: order })).map(serialize);
    res.type("text/csv").attachment("timetable.csv").send(toCsv(
      ["batch", "subject_code", "subject", "faculty", "weekday", "start_time", "end_time", "room", "hours", "sample_data"],
      rows.map((e) => [e.batchName, e.subjectCode, e.subjectName, e.facultyName, e.weekdayName, e.startTime, e.endTime, e.room, e.hours, e.isSample ? "yes" : "no"]),
    ));
  }));

  r.post("/timetable", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const b = parse(timetableCreate, req.body);
    failOnIssues(slotIssues(b));
    const prisma = needDb(db);
    const subject = await prisma.subject.findUnique({ where: { id: b.subjectId }, include: { batch: { include: { semester: true } }, faculty: true } });
    if (!subject || !inScope(scopeOf(res), subject.batch.semester.campusId)) throw validationFailed([{ path: "subjectId", message: "Subject not found" }]);
    const conflicts = await checkSlotConflicts(prisma, slotContextFor(subject), b);
    if (conflicts.length) throw new HttpError(409, "timetable_conflict", "This slot clashes with existing timetable entries.", { conflicts });
    const created = await prisma.timetableEntry.create({ data: b, include });
    res.status(201).json(serialize(created));
  }));

  r.patch("/timetable/:id", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const b = parse(timetableUpdate, req.body);
    const prisma = needDb(db);
    const current = await prisma.timetableEntry.findUnique({ where: { id: req.params.id }, include: { subject: { include: { batch: { include: { semester: true } }, faculty: true } } } });
    if (!current) throw notFound("Timetable entry");
    hideOutOfScope(res, current.subject.batch.semester.campusId, "Timetable entry");
    const next = { weekday: b.weekday ?? current.weekday, startTime: b.startTime ?? current.startTime, endTime: b.endTime ?? current.endTime, room: b.room === undefined ? current.room : b.room };
    failOnIssues(slotIssues(next));
    const conflicts = await checkSlotConflicts(prisma, slotContextFor(current.subject), { id: current.id, ...next });
    if (conflicts.length) throw new HttpError(409, "timetable_conflict", "This slot clashes with existing timetable entries.", { conflicts });
    const updated = await prisma.timetableEntry.update({ where: { id: current.id }, data: next, include });
    res.json(serialize(updated));
  }));

  r.delete("/timetable/:id", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const prisma = needDb(db);
    const entry = await prisma.timetableEntry.findUnique({ where: { id: req.params.id }, include: { subject: { select: { name: true, batch: { select: { semester: { select: { campusId: true } } } } } }, _count: { select: { sessionLogs: true } } } });
    if (!entry) throw notFound("Timetable entry");
    hideOutOfScope(res, entry.subject.batch.semester.campusId, "Timetable entry");
    // Logs point at the slot they were taught in. Deleting it would detach them (the schema would SetNull) and rewrite the
    // historical plan and pace, so a slot that has history can only be removed once that history is gone.
    if (entry._count.sessionLogs > 0) throw inUse(`Cannot delete this ${entry.subject.name} class: ${entry._count.sessionLogs} session log(s) were recorded against it. Historical logs are kept, so the slot stays.`, { sessionLogs: entry._count.sessionLogs });
    await prisma.timetableEntry.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }));

  return r;
}
