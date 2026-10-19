import type { Prisma, PrismaClient } from "@prisma/client";
import { Router } from "express";
import { addDays } from "../domain/dates.js";
import { carryForwardFor } from "../domain/carryForward.js";
import { type LogDraft } from "../domain/sessionLogs.js";
import { asyncHandler, callerFaculty, callerRole, HttpError, needDb, notFound, parse, requireCapability, validationFailed } from "../http/errors.js";
import { carryForwardQuery, pendingQuery, reviewBody, scheduleQuery, sessionLogCreate, sessionLogQuery, sessionLogUpdate } from "../http/schemas.js";
import { dbDate, iso } from "../services/format.js";
import { computeSubjectResult, loadSubjectContexts, summarize } from "../services/progressionData.js";
import { sessionsInRange } from "../services/scheduleData.js";
import { logInclude, serializeLog, validateAgainstData } from "../services/sessionLogData.js";
import type { Deps } from "./deps.js";

/** Demo identity: which faculty member the caller says they are. NOT verified — see README. */

function assertOwnership(role: string | null, actorFaculty: string | null, subject: { facultyId: string | null; name: string }) {
  if (role !== "faculty") return; // admins and campus managers may log or correct on behalf of faculty
  if (!actorFaculty) throw new HttpError(403, "faculty_identity_required", "Choose which faculty member you are acting as (demo mode) before logging sessions.");
  if (subject.facultyId !== actorFaculty) throw new HttpError(403, "not_your_subject", `"${subject.name}" is not assigned to the faculty member you are acting as.`);
}

export function sessionLogsRouter(deps: Deps): Router {
  const { db, settings, today } = deps;
  const r = Router();

  const progressSummary = async (prisma: PrismaClient, subjectId: string) => {
    const [ctx] = await loadSubjectContexts(prisma, { id: subjectId });
    return ctx ? summarize(computeSubjectResult(ctx, today(), settings)) : null;
  };

  /* ---- schedule (planned classes + their log state) ---- */
  r.get("/session-logs/schedule", asyncHandler(async (req, res) => {
    const q = parse(scheduleQuery, req.query);
    const prisma = needDb(db);
    const { items, notices } = await sessionsInRange(prisma, { from: q.date, to: q.date, campusId: q.campusId, track: q.track, facultyId: q.facultyId });
    res.json({ date: q.date, today: today(), items, notices });
  }));

  r.get("/session-logs/pending", asyncHandler(async (req, res) => {
    const q = parse(pendingQuery, req.query);
    const prisma = needDb(db);
    const to = addDays(today(), -1);
    const { items } = await sessionsInRange(prisma, { from: addDays(today(), -q.days), to, campusId: q.campusId, track: q.track, facultyId: q.facultyId });
    res.json({ from: addDays(today(), -q.days), to, items: items.filter((i) => i.log === null).reverse() });
  }));

  /* ---- smart carry-forward: unfinished topics from the previous teaching session of the same subject (read-only) ---- */
  r.get("/session-logs/carry-forward", requireCapability("sessions:read"), asyncHandler(async (req, res) => {
    const q = parse(carryForwardQuery, req.query);
    const prisma = needDb(db);
    const [ctx] = await loadSubjectContexts(prisma, { id: q.subjectId });
    if (!ctx) throw notFound("Subject");
    assertOwnership(callerRole(res), callerFaculty(res), ctx.subject);
    const s = ctx.subject;
    const result = carryForwardFor({
      heldOn: q.heldOn, excludeLogId: q.excludeLogId ?? null,
      topics: s.units.flatMap((u) => u.topics.map((t) => ({ id: t.id, title: t.title, unitTitle: u.title, plannedHours: t.plannedHours }))),
      logs: s.sessions.map((l) => ({ id: l.id, heldOn: iso(l.heldOn), createdAtMs: l.createdAt.getTime(), outcome: l.outcome, carryForward: l.carryForward, entries: l.topicEntries.map((e) => ({ topicId: e.topicId, kind: e.kind, completionPct: e.completionPct })) })),
    });
    res.json({ subjectId: s.id, heldOn: q.heldOn, ...result });
  }));

  /* ---- list / detail ---- */
  r.get("/session-logs", requireCapability("sessions:read"), asyncHandler(async (req, res) => {
    const q = parse(sessionLogQuery, req.query);
    const prisma = needDb(db);
    const faculty = callerRole(res) === "faculty" ? callerFaculty(res) : q.facultyId ?? null;
    if (callerRole(res) === "faculty" && !faculty) throw new HttpError(403, "faculty_identity_required", "Choose which faculty member you are acting as (demo mode).");
    const where: Prisma.SessionLogWhereInput = {
      subjectId: q.subjectId, outcome: q.outcome,
      heldOn: { gte: q.from ? dbDate(q.from) : undefined, lte: q.to ? dbDate(q.to) : undefined },
      reviewedAt: q.reviewed === undefined ? undefined : q.reviewed === "true" ? { not: null } : null,
      subject: { facultyId: faculty ?? undefined, batchId: q.batchId, batch: { semesterId: q.semesterId, semester: { campusId: q.campusId, track: q.track } } },
    };
    const rows = await prisma.sessionLog.findMany({ where, include: logInclude, orderBy: [{ heldOn: "desc" }, { createdAt: "desc" }], take: q.limit });
    res.json({ logs: rows.map(serializeLog), limit: q.limit });
  }));

  r.get("/session-logs/:id", requireCapability("sessions:read"), asyncHandler(async (req, res) => {
    const prisma = needDb(db);
    const row = await prisma.sessionLog.findUnique({ where: { id: req.params.id! }, include: { ...logInclude, revisions: { orderBy: { revision: "desc" } }, mergedLogs: { select: { id: true, subject: { select: { name: true, batch: { select: { name: true } } } } } } } });
    if (!row) throw notFound("Session log");
    if (callerRole(res) === "faculty") assertOwnership("faculty", callerFaculty(res), row.subject);
    res.json({
      ...serializeLog(row),
      revisions: row.revisions.map((v) => ({ revision: v.revision, note: v.note, changedByRole: v.changedByRole, at: v.createdAt.toISOString(), snapshot: v.snapshot })),
      mergedLogs: row.mergedLogs.map((m) => ({ id: m.id, subjectName: m.subject.name, batchName: m.subject.batch.name })),
    });
  }));

  /* ---- create ---- */
  r.post("/session-logs", requireCapability("sessions:write"), asyncHandler(async (req, res) => {
    const b = parse(sessionLogCreate, req.body);
    const prisma = needDb(db);
    const role = callerRole(res);
    const [ctx] = await loadSubjectContexts(prisma, { id: b.subjectId });
    if (!ctx) throw validationFailed([{ path: "subjectId", message: "Subject not found" }]);
    assertOwnership(role, callerFaculty(res), ctx.subject);

    // one log per scheduled session: refuse a second one and point at the existing log (correct it instead)
    const dup = b.timetableEntryId
      ? await prisma.sessionLog.findUnique({ where: { timetableEntryId_heldOn: { timetableEntryId: b.timetableEntryId, heldOn: dbDate(b.heldOn) } } })
      : b.makeupOfId ? await prisma.sessionLog.findUnique({ where: { makeupOfId: b.makeupOfId } }) : null;
    if (dup) throw new HttpError(409, "duplicate_log", "This session already has a log. Open it and use \"Correct this log\" instead of creating another.", { existingLogId: dup.id });

    const draft: LogDraft = { outcome: b.outcome, heldOn: b.heldOn, timetableEntryId: b.timetableEntryId, makeupOfId: b.makeupOfId, actualHours: b.actualHours, covered: b.covered, leftover: b.leftover, skipped: b.skipped, notes: b.notes, carryForward: b.carryForward, rescheduledTo: b.rescheduledTo, mergedIntoId: b.mergedIntoId };
    const { entry, makeupSource } = await validateAgainstData(prisma, ctx, draft, today(), null);

    const before = summarize(computeSubjectResult(ctx, today(), settings));
    const slot = entry ? { slotStart: entry.startTime, slotEnd: entry.endTime, scheduledHours: hoursOf(entry.startTime, entry.endTime) } : makeupSource ? { slotStart: makeupSource.slotStart, slotEnd: makeupSource.slotEnd, scheduledHours: makeupSource.scheduledHours } : { slotStart: null, slotEnd: null, scheduledHours: null };
    const created = await prisma.sessionLog.create({
      data: {
        subjectId: b.subjectId, timetableEntryId: b.timetableEntryId, makeupOfId: b.makeupOfId, mergedIntoId: b.mergedIntoId, heldOn: dbDate(b.heldOn), ...slot,
        actualHours: b.actualHours, outcome: b.outcome, rescheduledTo: b.rescheduledTo ? dbDate(b.rescheduledTo) : null, carryForward: b.carryForward, notes: b.notes,
        classworkStatus: b.classworkStatus, homeworkStatus: b.homeworkStatus, loggedByRole: role ?? "unknown", loggedByFacultyId: role === "faculty" ? callerFaculty(res) : null,
        topicEntries: { create: entriesOf(b) },
      },
      include: logInclude,
    });
    res.status(201).json({ log: serializeLog(created), progress: { before, after: await progressSummary(prisma, b.subjectId) } });
  }));

  /* ---- correct (explicit correction workflow with audit trail) ---- */
  r.patch("/session-logs/:id", requireCapability("sessions:write"), asyncHandler(async (req, res) => {
    const b = parse(sessionLogUpdate, req.body);
    const prisma = needDb(db);
    const role = callerRole(res);
    const current = await prisma.sessionLog.findUnique({ where: { id: req.params.id! }, include: { ...logInclude, mergedLogs: { select: { id: true } }, makeup: { select: { id: true } } } });
    if (!current) throw notFound("Session log");
    assertOwnership(role, callerFaculty(res), current.subject);

    const [ctx] = await loadSubjectContexts(prisma, { id: current.subjectId });
    const had = serializeLog(current);
    const draft: LogDraft = {
      outcome: b.outcome ?? current.outcome, heldOn: iso(current.heldOn), timetableEntryId: current.timetableEntryId, makeupOfId: current.makeupOfId,
      actualHours: b.actualHours === undefined ? current.actualHours : b.actualHours,
      covered: b.covered ?? had.covered.map((t) => ({ topicId: t.topicId, completionPct: t.completionPct })),
      leftover: b.leftover ?? had.leftover.map((t) => t.topicId), skipped: b.skipped ?? had.skipped.map((t) => t.topicId),
      notes: b.notes === undefined ? current.notes : b.notes, carryForward: b.carryForward === undefined ? current.carryForward : b.carryForward,
      rescheduledTo: b.rescheduledTo === undefined ? (current.rescheduledTo ? iso(current.rescheduledTo) : null) : b.rescheduledTo,
      mergedIntoId: b.mergedIntoId === undefined ? current.mergedIntoId : b.mergedIntoId,
    };
    if (draft.outcome !== "MERGED") draft.mergedIntoId = null;
    if (draft.outcome !== "CANCELLED") draft.rescheduledTo = null;
    if (draft.outcome === "CANCELLED" || draft.outcome === "SKIPPED") { draft.covered = []; draft.leftover = []; draft.skipped = []; draft.actualHours = null; }
    if (draft.outcome !== "COMPLETED" && draft.outcome !== "IN_PROGRESS") draft.actualHours = null;

    // other records depend on this log: refuse corrections that would orphan them
    if (current.mergedLogs.length > 0 && draft.outcome !== "COMPLETED" && draft.outcome !== "IN_PROGRESS") throw new HttpError(409, "in_use", "Other sessions were merged into this one; correct those first.", { blockers: { mergedSessions: current.mergedLogs.length } });
    if (current.makeup && (draft.outcome !== "CANCELLED" || draft.rescheduledTo !== (current.rescheduledTo ? iso(current.rescheduledTo) : null))) throw new HttpError(409, "in_use", "The make-up session for this log was already logged; correct that one first.", { blockers: { makeupSessions: 1 } });

    await validateAgainstData(prisma, ctx!, draft, today(), current.id);
    const before = summarize(computeSubjectResult(ctx!, today(), settings));
    await prisma.$transaction(async (tx) => {
      await tx.sessionLogRevision.create({ data: { sessionLogId: current.id, revision: current.revision, note: b.correctionNote, changedByRole: role ?? "unknown", snapshot: had as unknown as Prisma.InputJsonValue } });
      await tx.sessionTopicEntry.deleteMany({ where: { sessionLogId: current.id } });
      await tx.sessionLog.update({
        where: { id: current.id },
        data: {
          outcome: draft.outcome, actualHours: draft.actualHours, notes: draft.notes, carryForward: draft.carryForward,
          classworkStatus: b.classworkStatus ?? current.classworkStatus, homeworkStatus: b.homeworkStatus ?? current.homeworkStatus,
          rescheduledTo: draft.rescheduledTo ? dbDate(draft.rescheduledTo) : null, mergedIntoId: draft.mergedIntoId,
          revision: { increment: 1 }, reviewedAt: null, reviewedByRole: null, reviewNote: null, // a corrected log needs a fresh review
          topicEntries: { create: entriesOf(draft) },
        },
      });
    });
    const updated = await prisma.sessionLog.findUniqueOrThrow({ where: { id: current.id }, include: logInclude });
    res.json({ log: serializeLog(updated), progress: { before, after: await progressSummary(prisma, current.subjectId) } });
  }));

  /* ---- review ---- */
  r.post("/session-logs/:id/review", requireCapability("sessions:review"), asyncHandler(async (req, res) => {
    const { note } = parse(reviewBody, req.body);
    const prisma = needDb(db);
    if (!(await prisma.sessionLog.findUnique({ where: { id: req.params.id! } }))) throw notFound("Session log");
    const updated = await prisma.sessionLog.update({ where: { id: req.params.id! }, data: { reviewedAt: new Date(), reviewedByRole: callerRole(res), reviewNote: note }, include: logInclude });
    res.json(serializeLog(updated));
  }));

  return r;
}

const hoursOf = (a: string, b: string) => (Number(b.slice(0, 2)) * 60 + Number(b.slice(3, 5)) - Number(a.slice(0, 2)) * 60 - Number(a.slice(3, 5))) / 60;
const entriesOf = (d: { covered: Array<{ topicId: string; completionPct: number }>; leftover: string[]; skipped: string[] }) => [
  ...d.covered.map((c) => ({ topicId: c.topicId, kind: "COVERED" as const, completionPct: c.completionPct })),
  ...d.leftover.map((topicId) => ({ topicId, kind: "LEFTOVER" as const, completionPct: 0 })),
  ...d.skipped.map((topicId) => ({ topicId, kind: "SKIPPED" as const, completionPct: 0 })),
];

