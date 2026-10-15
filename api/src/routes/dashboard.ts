import { Router } from "express";
import { z } from "zod";
import { demoCampuses, demoSchedule, demoSemester, demoSessions, demoSubjects } from "../data/demo.js";
import { buildDashboard } from "../domain/dashboard.js";
import { buildLiveDashboard } from "../services/liveDashboard.js";
import type { Deps } from "./deps.js";

const query = z.object({ campusId: z.string().min(1).max(64).default(demoCampuses[0]!.id) });

/**
 * Live data when a database is connected and the campus has semesters; otherwise the labelled demo dataset.
 * `dataSource` says which one you got.
 */
export function dashboardRouter({ db, now, settings, today }: Deps): Router {
  const router = Router();
  router.get("/dashboard", async (req, res, next) => {
    try {
      const parsed = query.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_query", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
        return;
      }
      if (!demoCampuses.some((c) => c.id === parsed.data.campusId)) { res.status(404).json({ error: "campus_not_found" }); return; }
      if (db.prisma) {
        try {
          const live = await buildLiveDashboard(db.prisma, parsed.data.campusId, now(), today(), settings);
          if (live) { res.json(live); return; }
        } catch (error) {
          console.error("Live dashboard failed, falling back to demo data:", error);
        }
      }
      const data = buildDashboard(
        { campuses: demoCampuses, semester: demoSemester, subjects: demoSubjects, schedule: demoSchedule, sessions: demoSessions },
        parsed.data.campusId, now(),
      );
      res.json(data);
    } catch (error) { next(error); }
  });
  return router;
}
