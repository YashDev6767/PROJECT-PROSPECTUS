import { Router } from "express";
import { z } from "zod";
import { campuses } from "../data/campuses.js";
import { describeMonth, requiresSpecialWorkingPermission, type SaturdayRule } from "../domain/calendar.js";
import { monthBounds } from "../domain/dates.js";
import { can } from "../domain/permissions.js";
import { toCsv } from "../domain/csv.js";
import { asyncHandler, callerRole, failOnIssues, HttpError, needDb, notFound, parse, requireCapability } from "../http/errors.js";
import { calendarFields, calendarIssues, calendarUpdate, campusId, monthQuery } from "../http/schemas.js";
import { toEntryLike } from "../services/calendarData.js";
import { dbDate, iso } from "../services/format.js";
import { assertCampus, assertOrganizationWide, hideOutOfScope } from "../http/scope.js";
import type { Deps } from "./deps.js";

const DEFAULT_RULE: SaturdayRule = "SECOND_FOURTH";
const campusName = (id: string | null) => (id === null ? "All campuses" : campuses.find((c) => c.id === id)?.name ?? id);

type Row = { id: string; title: string; category: "HOLIDAY" | "EVENT" | "EXAM" | "ACADEMIC_DEADLINE" | "SPECIAL_WORKING_DAY"; startsOn: Date; endsOn: Date; campusId: string | null; description: string | null; isSample: boolean };
const serialize = (e: Row) => ({ id: e.id, title: e.title, category: e.category, startsOn: iso(e.startsOn), endsOn: iso(e.endsOn), campusId: e.campusId, description: e.description, isSample: e.isSample });

/** Special working days override holidays and weekends, so creating or touching one needs its own permission. */
function assertSpecialPermission(res: Parameters<typeof callerRole>[0], ...categories: Row["category"][]) {
  if (categories.some(requiresSpecialWorkingPermission) && !can(callerRole(res), "special_working_day:write")) {
    throw new HttpError(403, "forbidden", "Only authorised users can create or change Special Working Days.");
  }
}

/** Writing an entry: a campus entry needs that campus in scope; an institution-wide entry (no campus) needs organization-wide scope. */
const assertEntryCampus = (res: Parameters<typeof assertCampus>[0], campusId: string | null) => (campusId === null ? assertOrganizationWide(res) : assertCampus(res, campusId));
/** An existing entry: other campuses' entries do not exist for this caller; institution-wide ones are visible but organization-wide only to change. */
const assertOwnEntry = (res: Parameters<typeof assertCampus>[0], campusId: string | null) => (campusId === null ? assertOrganizationWide(res) : hideOutOfScope(res, campusId, "Calendar entry"));

export function calendarRouter({ db }: Deps): Router {
  const r = Router();

  r.get("/calendar/month", asyncHandler(async (req, res) => {
    const q = parse(monthQuery, req.query);
    assertCampus(res, q.campusId);
    const prisma = needDb(db);
    const { from, to } = monthBounds(q.month);

    const semesters = await prisma.semester.findMany({ where: { campusId: q.campusId, track: q.track, startsOn: { lte: dbDate(to) }, endsOn: { gte: dbDate(from) } } });
    const semester = [...semesters].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.startsOn.getTime() - b.startsOn.getTime())[0] ?? null;
    const rule: SaturdayRule = semester?.saturdayRule ?? DEFAULT_RULE;

    const [entryRows, examRows] = await Promise.all([
      prisma.calendarEntry.findMany({ where: { OR: [{ campusId: null }, { campusId: q.campusId }], startsOn: { lte: dbDate(to) }, endsOn: { gte: dbDate(from) } }, orderBy: [{ startsOn: "asc" }, { title: "asc" }] }),
      prisma.exam.findMany({ where: { semester: { campusId: q.campusId, track: q.track }, startsOn: { lte: dbDate(to) }, endsOn: { gte: dbDate(from) } }, include: { batch: true }, orderBy: { startsOn: "asc" } }),
    ]);
    const exams = examRows.map((e) => ({ id: e.id, name: e.name, type: e.type, startsOn: iso(e.startsOn), endsOn: iso(e.endsOn), batchName: e.batch?.name ?? null, isSample: e.isSample }));
    const days = describeMonth(q.month, rule, entryRows.map(toEntryLike)).map((d) => ({
      date: d.date, weekday: d.weekday, working: d.working, reason: d.reason,
      entryIds: d.entries.map((e) => e.id),
      examIds: exams.filter((e) => e.startsOn <= d.date && d.date <= e.endsOn).map((e) => e.id),
    }));
    res.json({
      month: q.month, campusId: q.campusId, track: q.track,
      saturdayRule: rule, ruleSource: semester ? "semester" : "default",
      semester: semester ? { id: semester.id, name: semester.name, isActive: semester.isActive } : null,
      days, entries: entryRows.map(serialize), exams,
    });
  }));

  r.get("/calendar/export.csv", asyncHandler(async (req, res) => {
    const q = parse(z.object({ campusId }), req.query);
    assertCampus(res, q.campusId);
    const prisma = needDb(db);
    const rows = await prisma.calendarEntry.findMany({ where: { OR: [{ campusId: null }, { campusId: q.campusId }] }, orderBy: [{ startsOn: "asc" }, { title: "asc" }] });
    res.type("text/csv").attachment(`calendar-${q.campusId}.csv`).send(toCsv(
      ["title", "category", "start_date", "end_date", "scope", "description", "sample_data"],
      rows.map((e) => [e.title, e.category, iso(e.startsOn), iso(e.endsOn), campusName(e.campusId), e.description, e.isSample ? "yes" : "no"]),
    ));
  }));

  r.post("/calendar/entries", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const b = parse(calendarFields, req.body);
    const endsOn = b.endsOn ?? b.startsOn;
    failOnIssues(calendarIssues({ startsOn: b.startsOn, endsOn }));
    assertSpecialPermission(res, b.category);
    assertEntryCampus(res, b.campusId);
    const prisma = needDb(db);
    const created = await prisma.calendarEntry.create({ data: { title: b.title, category: b.category, startsOn: dbDate(b.startsOn), endsOn: dbDate(endsOn), campusId: b.campusId, description: b.description } });
    res.status(201).json(serialize(created));
  }));

  r.patch("/calendar/entries/:id", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const b = parse(calendarUpdate, req.body);
    const prisma = needDb(db);
    const current = await prisma.calendarEntry.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Calendar entry");
    assertOwnEntry(res, current.campusId);
    if (b.campusId !== undefined) assertEntryCampus(res, b.campusId);
    const next = {
      title: b.title ?? current.title, category: b.category ?? current.category,
      startsOn: b.startsOn ?? iso(current.startsOn), endsOn: b.endsOn ?? iso(current.endsOn),
      campusId: b.campusId === undefined ? current.campusId : b.campusId,
      description: b.description === undefined ? current.description : b.description,
    };
    failOnIssues(calendarIssues(next));
    assertSpecialPermission(res, current.category, next.category);
    const updated = await prisma.calendarEntry.update({ where: { id: current.id }, data: { title: next.title, category: next.category, startsOn: dbDate(next.startsOn), endsOn: dbDate(next.endsOn), campusId: next.campusId, description: next.description } });
    res.json(serialize(updated));
  }));

  r.delete("/calendar/entries/:id", requireCapability("academic:write"), asyncHandler(async (req, res) => {
    const prisma = needDb(db);
    const current = await prisma.calendarEntry.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Calendar entry");
    assertOwnEntry(res, current.campusId);
    assertSpecialPermission(res, current.category);
    await prisma.calendarEntry.delete({ where: { id: current.id } });
    res.status(204).end();
  }));

  return r;
}

