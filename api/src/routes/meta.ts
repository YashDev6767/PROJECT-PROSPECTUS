import { Router } from "express";
import { campuses, tracks } from "../data/campuses.js";
import { calendarCategories, saturdayRules } from "../domain/calendar.js";
import { examTypeLabels, examTypes } from "../domain/exams.js";
import { inScope, scopeOf } from "../http/scope.js";

/** Static configuration for the signed-in app. Not public in production; the campus list is limited to the caller's campuses. */
export function metaRouter(): Router {
  const router = Router();
  router.get("/meta", (_req, res) => {
    const scope = scopeOf(res);
    res.json({ campuses: campuses.filter((c) => inScope(scope, c.id)), tracks, saturdayRules, calendarCategories, examTypes: examTypes.map((id) => ({ id, name: examTypeLabels[id] })) });
  });
  return router;
}
