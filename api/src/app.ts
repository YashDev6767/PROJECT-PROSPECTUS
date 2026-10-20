import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { Env } from "./config/env.js";
import type { Database } from "./db/client.js";
import { errorHandler } from "./http/errors.js";
import { todayInZone } from "./domain/clock.js";
import { resolveSettings } from "./services/settings.js";
import { progressionRouter } from "./routes/progression.js";
import { sessionLogsRouter } from "./routes/sessionLogs.js";
import { calendarRouter } from "./routes/calendar.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { examReadinessRouter } from "./routes/examReadiness.js";
import { examsRouter } from "./routes/exams.js";
import { healthRouter } from "./routes/health.js";
import { metaRouter } from "./routes/meta.js";
import { peopleRouter } from "./routes/people.js";
import { semestersRouter } from "./routes/semesters.js";
import { subjectsRouter } from "./routes/subjects.js";
import { syllabusRouter } from "./routes/syllabus.js";
import { timetableRouter } from "./routes/timetable.js";
import { reportsRouter } from "./routes/reports.js";
import { studentRouter } from "./routes/student.js";
import { authRouter } from "./routes/auth.js";
import { createAuth } from "./services/auth.js";
import { roleFromHeader } from "./domain/permissions.js";
import { HttpError, type Identity } from "./http/errors.js";
import { demoScope, isEmpty, resolveScope } from "./http/scope.js";

export function createApp(env: Pick<Env, "CORS_ORIGIN"> & Partial<Pick<Env, "APP_TIME_ZONE" | "RISK_ON_TRACK_BUFFER" | "RISK_TIGHT_BUFFER" | "SYLLABUS_DEADLINE_EXAM_TYPE" | "NODE_ENV" | "ALLOW_DEMO_HEADERS" | "AUTH_USERS" | "SESSION_SECRET" | "SESSION_TTL_HOURS" | "DEMO_DEFAULT_CAMPUS">>, db: Database, now: () => Date = () => new Date()) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()), exposedHeaders: ["Content-Disposition"], credentials: true }));
  app.use(express.json({ limit: "1.5mb" }));

  // Security: client-controlled demo headers are disabled in production unless explicitly permitted
  app.locals.allowDemoHeaders = env.ALLOW_DEMO_HEADERS ?? (env.NODE_ENV !== "production");

  const auth = createAuth(env);
  const allowDemo = app.locals.allowDemoHeaders as boolean;
  // Establish the caller (and their campus scope) once per request. A valid signed session always wins over demo headers.
  app.use("/api", (req, res, next) => {
    void (async () => {
      const session = auth.read(req.headers.cookie, now().getTime());
      if (session) {
        const scope = await resolveScope(db.prisma, { role: session.role, source: "session", campusIds: session.campusIds, facultyId: session.facultyId, batchId: session.batchId });
        res.locals.identity = { source: "session", role: session.role, facultyId: session.facultyId, batchId: session.batchId, email: session.email, scope } satisfies Identity;
      } else if (allowDemo) {
        const role = roleFromHeader(req.header("x-demo-role"));
        if (role) {
          const scope = await resolveScope(db.prisma, { role, source: "demo", campusIds: null, facultyId: null, batchId: null, demoCampusHeader: req.header("x-demo-campus"), demoDefaultCampus: env.DEMO_DEFAULT_CAMPUS });
          res.locals.identity = { source: "demo", role, facultyId: req.header("x-demo-faculty")?.trim() || null, batchId: req.header("x-demo-batch")?.trim() || null, email: null, scope } satisfies Identity;
        } else res.locals.demoScope = demoScope(req.header("x-demo-campus"), env.DEMO_DEFAULT_CAMPUS); // anonymous development caller: still a single campus
      }
    })().then(() => next(), next);
  });
  app.use("/api", authRouter(auth, allowDemo, now));
  // Whenever the spoofable demo headers are off (production), academic data — including every CSV export — needs a verified session.
  // Only liveness, static metadata and the sign-in endpoints stay anonymous. (In development the demo picker keeps reads open.)
  if (!allowDemo) {
    const anonymousOk = (path: string) => path === "/health"; // liveness only; /meta now needs a session (nothing before login needs it)
    app.use("/api", (req, res, next) => (res.locals.identity || anonymousOk(req.path) ? next() : next(new HttpError(401, "unauthenticated", req.header("x-demo-role") ? "Demo authentication headers (X-Demo-Role) are disabled in production mode. Production deployment requires server-verified authentication — sign in." : "Sign in to view academic data."))));
  }

  // Fail closed: an authenticated caller whose campus scope is empty (no campus assigned, unknown linked faculty/batch, ...) can use nothing
  // beyond liveness, static metadata and sign-in. This runs in every mode, before any route.
  app.use("/api", (req, res, next) => {
    const id = res.locals.identity as Identity | undefined;
    if (id && isEmpty(id.scope) && req.path !== "/health") {
      return next(new HttpError(403, "no_campus_assigned", "Your account is not linked to any campus, so it cannot access academic data. Ask the administrator to assign a campus (campus managers), link your faculty record (faculty) or your batch (students)."));
    }
    next();
  });

  const settings = resolveSettings(env);
  const deps = { db, now, settings, today: () => todayInZone(now(), settings.timeZone) };
  app.use("/api", healthRouter(db, allowDemo));
  app.use("/api", dashboardRouter(deps));
  app.use("/api", metaRouter());
  for (const router of [semestersRouter, calendarRouter, examsRouter, peopleRouter, subjectsRouter, timetableRouter, syllabusRouter, sessionLogsRouter, progressionRouter, examReadinessRouter, reportsRouter, studentRouter]) {
    app.use("/api", router(deps));
  }
  app.use("/api", (_req, res) => { res.status(404).json({ error: "not_found", message: "No such endpoint" }); });
  app.use(errorHandler);
  return app;
}
