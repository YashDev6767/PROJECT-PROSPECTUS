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
import { authRouter } from "./routes/auth.js";
import { createAuth } from "./services/auth.js";
import { roleFromHeader } from "./domain/permissions.js";
import { HttpError, type Identity } from "./http/errors.js";

export function createApp(env: Pick<Env, "CORS_ORIGIN"> & Partial<Pick<Env, "APP_TIME_ZONE" | "RISK_ON_TRACK_BUFFER" | "RISK_TIGHT_BUFFER" | "SYLLABUS_DEADLINE_EXAM_TYPE" | "NODE_ENV" | "ALLOW_DEMO_HEADERS" | "AUTH_USERS" | "SESSION_SECRET" | "SESSION_TTL_HOURS">>, db: Database, now: () => Date = () => new Date()) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()), exposedHeaders: ["Content-Disposition"], credentials: true }));
  app.use(express.json({ limit: "1.5mb" }));

  // Security: client-controlled demo headers are disabled in production unless explicitly permitted
  app.locals.allowDemoHeaders = env.ALLOW_DEMO_HEADERS ?? (env.NODE_ENV !== "production");

  const auth = createAuth(env);
  const allowDemo = app.locals.allowDemoHeaders as boolean;
  // Establish the caller once per request. A valid signed session always wins over demo headers.
  app.use("/api", (req, res, next) => {
    const session = auth.read(req.headers.cookie, now().getTime());
    if (session) res.locals.identity = { source: "session", role: session.role, facultyId: session.facultyId, email: session.email } satisfies Identity;
    else if (allowDemo) {
      const role = roleFromHeader(req.header("x-demo-role"));
      if (role) res.locals.identity = { source: "demo", role, facultyId: req.header("x-demo-faculty")?.trim() || null, email: null } satisfies Identity;
    }
    next();
  });
  app.use("/api", authRouter(auth, allowDemo, now));
  // Whenever the spoofable demo headers are off (production), academic data — including every CSV export — needs a verified session.
  // Only liveness, static metadata and the sign-in endpoints stay anonymous. (In development the demo picker keeps reads open.)
  if (!allowDemo) {
    const anonymousOk = (path: string) => path === "/health" || path === "/meta";
    app.use("/api", (req, res, next) => (res.locals.identity || anonymousOk(req.path) ? next() : next(new HttpError(401, "unauthenticated", req.header("x-demo-role") ? "Demo authentication headers (X-Demo-Role) are disabled in production mode. Production deployment requires server-verified authentication — sign in." : "Sign in to view academic data."))));
  }

  const settings = resolveSettings(env);
  const deps = { db, now, settings, today: () => todayInZone(now(), settings.timeZone) };
  app.use("/api", healthRouter(db));
  app.use("/api", dashboardRouter(deps));
  app.use("/api", metaRouter());
  for (const router of [semestersRouter, calendarRouter, examsRouter, peopleRouter, subjectsRouter, timetableRouter, syllabusRouter, sessionLogsRouter, progressionRouter, examReadinessRouter, reportsRouter]) {
    app.use("/api", router(deps));
  }
  app.use("/api", (_req, res) => { res.status(404).json({ error: "not_found", message: "No such endpoint" }); });
  app.use(errorHandler);
  return app;
}
