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

export function createApp(env: Pick<Env, "CORS_ORIGIN"> & Partial<Pick<Env, "APP_TIME_ZONE" | "RISK_ON_TRACK_BUFFER" | "RISK_TIGHT_BUFFER" | "SYLLABUS_DEADLINE_EXAM_TYPE">>, db: Database, now: () => Date = () => new Date()) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()), exposedHeaders: ["Content-Disposition"] }));
  app.use(express.json({ limit: "1.5mb" }));

  const settings = resolveSettings(env);
  const deps = { db, now, settings, today: () => todayInZone(now(), settings.timeZone) };
  app.use("/api", healthRouter(db));
  app.use("/api", dashboardRouter(deps));
  app.use("/api", metaRouter());
  for (const router of [semestersRouter, calendarRouter, examsRouter, peopleRouter, subjectsRouter, timetableRouter, syllabusRouter, sessionLogsRouter, progressionRouter, examReadinessRouter]) {
    app.use("/api", router(deps));
  }
  app.use("/api", (_req, res) => { res.status(404).json({ error: "not_found", message: "No such endpoint" }); });
  app.use(errorHandler);
  return app;
}
