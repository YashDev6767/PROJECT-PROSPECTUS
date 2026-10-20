import { Router } from "express";
import { z } from "zod";
import { demoCampuses, demoSchedule, demoSemester, demoSessions, demoSubjects } from "../data/demo.js";
import { buildDashboard } from "../domain/dashboard.js";
import { buildLiveDashboard } from "../services/liveDashboard.js";
import { HttpError } from "../http/errors.js";
import { audienceOf, examAudience, inScope, scopeOf, subjectAudience } from "../http/scope.js";
import type { Deps } from "./deps.js";

const query = z.object({ campusId: z.string().min(1).max(64).optional() });

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
      // Campus: a named campus must be in the caller's scope (403); otherwise default to the first campus the caller may see.
      const scope = scopeOf(res);
      const allowed = demoCampuses.filter((c) => inScope(scope, c.id));
      const requested = parsed.data.campusId ?? allowed[0]?.id ?? demoCampuses[0]!.id;
      if (!demoCampuses.some((c) => c.id === requested)) { res.status(404).json({ error: "campus_not_found" }); return; }
      if (!inScope(scope, requested)) throw new HttpError(403, "forbidden_campus", "Your account is not allowed to access that campus.");
      // Real accounts are only told about their own campuses. A development demo preview lists every campus name as picker options (names only; its data is still limited to the campus it names in X-Demo-Campus).
      const isSession = (res.locals.identity as { source?: string } | undefined)?.source === "session";
      const withScopedCampuses = <T extends { campuses: Array<{ id: string }> }>(d: T): T => (isSession ? { ...d, campuses: d.campuses.filter((c) => inScope(scope, c.id)) } : d);
      if (db.prisma) {
        try {
          const aud = audienceOf(res);
          const live = await buildLiveDashboard(db.prisma, requested, now(), today(), settings, { subject: subjectAudience(aud), exam: examAudience(aud), facultyId: aud.kind === "faculty" ? aud.facultyId : undefined, batchId: aud.kind === "student" ? aud.batchId : undefined });
          if (live) { res.json(withScopedCampuses(live)); return; }
          // a connected database with no semesters for this campus: the labelled demo dataset below (dataSource "demo")
        } catch (error) {
          // Never substitute demo numbers for a failed live computation: that would look like real, reassuring data.
          console.error("Live dashboard failed:", error);
          res.status(503).json({ error: "dashboard_unavailable", message: "The live dashboard could not be computed right now, so no academic status is shown. This is a data problem, not an all-clear." });
          return;
        }
      }
      const data = buildDashboard(
        { campuses: demoCampuses, semester: demoSemester, subjects: demoSubjects, schedule: demoSchedule, sessions: demoSessions },
        requested, now(),
      );
      if (!data) { res.status(404).json({ error: "campus_not_found" }); return; }
      res.json(withScopedCampuses(data));
    } catch (error) { next(error); }
  });
  return router;
}
