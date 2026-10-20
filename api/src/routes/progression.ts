import { Router } from "express";
import { asyncHandler, HttpError, needDb, notFound, parse } from "../http/errors.js";
import { asOfQuery, progressionQuery } from "../http/schemas.js";
import { dbDate, iso } from "../services/format.js";
import { computeSubjectResult, loadSubjectContexts, rollup, summarize } from "../services/progressionData.js";
import { logInclude, serializeLog } from "../services/sessionLogData.js";
import type { Deps } from "./deps.js";
import type { Prisma } from "@prisma/client";
import { and, assertCampus, audienceOf, hideOutOfScope, hideUnlessAudience, semesterAudience, subjectAudience } from "../http/scope.js";

export function progressionRouter({ db, settings, today }: Deps): Router {
  const r = Router();

  /** Everything needed to explain ONE subject: numbers, reasons, per-topic status, recent logs. */
  r.get("/progression/subjects/:id", asyncHandler(async (req, res) => {
    const { asOf } = parse(asOfQuery, req.query);
    const prisma = needDb(db);
    const [ctx] = await loadSubjectContexts(prisma, { id: req.params.id! });
    if (!ctx) throw notFound("Subject");
    hideOutOfScope(res, ctx.subject.batch.semester.campusId, "Subject");
    hideUnlessAudience(res, ctx.subject, "Subject");
    const result = computeSubjectResult(ctx, asOf ?? today(), settings);
    const recent = await prisma.sessionLog.findMany({ where: { subjectId: ctx.subject.id, heldOn: { lte: dbDate(result.referenceDate) } }, include: logInclude, orderBy: [{ heldOn: "desc" }, { createdAt: "desc" }], take: 8 });
    res.json({
      asOf: asOf ?? today(), referenceDate: result.referenceDate, subject: result.subject,
      deadline: result.deadline, thresholds: settings.thresholds, progress: result.progress,
      hoursTaught: result.hoursTaught, sessionsLogged: result.sessionsLogged, lastLoggedOn: result.lastLoggedOn,
      teachingCapacityHours: result.teachingCapacityHours, weeklyHours: result.weeklyHours,
      recentLogs: recent.map(serializeLog),
    });
  }));

  /** Subject rows plus batch / track / campus roll-ups (worst subject wins). */
  r.get("/progression", asyncHandler(async (req, res) => {
    const q = parse(progressionQuery, req.query);
    assertCampus(res, q.campusId);
    const prisma = needDb(db);
    const asOf = q.asOf ?? today();
    const aud = audienceOf(res);
    const semesters = q.semesterId
      ? await prisma.semester.findMany({ where: and<Prisma.SemesterWhereInput>({ id: q.semesterId, campusId: q.campusId }, semesterAudience(aud)) })
      : await prisma.semester.findMany({ where: and<Prisma.SemesterWhereInput>({ campusId: q.campusId, track: q.track, isActive: true, startsOn: { lte: dbDate(asOf) }, endsOn: { gte: dbDate(asOf) } }, semesterAudience(aud)) });
    if (q.semesterId && semesters.length === 0) throw new HttpError(404, "not_found", "That semester does not belong to this campus");
    const contexts = await loadSubjectContexts(prisma, and<Prisma.SubjectWhereInput>({ batchId: q.batchId, batch: { semesterId: { in: semesters.map((s) => s.id) }, semester: { track: q.track } } }, subjectAudience(aud)));
    const results = contexts.map((c) => computeSubjectResult(c, asOf, settings));
    res.json({
      asOf, campusId: q.campusId, thresholds: settings.thresholds,
      semesters: semesters.map((s) => ({ id: s.id, name: s.name, track: s.track, startsOn: iso(s.startsOn), endsOn: iso(s.endsOn) })),
      subjects: results.map(summarize), ...rollup(results),
    });
  }));

  return r;
}
