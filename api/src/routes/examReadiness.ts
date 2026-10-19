import { Router } from "express";
import { asyncHandler, needDb, parse } from "../http/errors.js";
import { progressionQuery } from "../http/schemas.js";
import { buildExamReadiness } from "../services/examReadiness.js";
import type { Deps } from "./deps.js";
import { assertCampus } from "../http/scope.js";

export function examReadinessRouter({ db, settings, today }: Deps): Router {
  const r = Router();
  /** Upcoming / under-way exams for the campus with each applicable subject's readiness against that exam's start date. */
  r.get("/exam-readiness", asyncHandler(async (req, res) => {
    const q = parse(progressionQuery, req.query);
    assertCampus(res, q.campusId);
    const prisma = needDb(db);
    res.json(await buildExamReadiness(prisma, { campusId: q.campusId, track: q.track, semesterId: q.semesterId, asOf: q.asOf ?? today() }, settings));
  }));
  return r;
}
