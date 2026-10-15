import { Router } from "express";
import { campuses, tracks } from "../data/campuses.js";
import { calendarCategories, saturdayRules } from "../domain/calendar.js";
import { examTypeLabels, examTypes } from "../domain/exams.js";

export function metaRouter(): Router {
  const router = Router();
  router.get("/meta", (_req, res) => {
    res.json({ campuses, tracks, saturdayRules, calendarCategories, examTypes: examTypes.map((id) => ({ id, name: examTypeLabels[id] })) });
  });
  return router;
}
