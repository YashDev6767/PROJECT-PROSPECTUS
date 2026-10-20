import { Router } from "express";
import type { Database } from "../db/client.js";

/** Anonymous callers in production get liveness only; database state, latency, uptime and configuration hints need a session. */
export function healthRouter(db: Database, demoMode = true): Router {
  const router = Router();
  router.get("/health", async (_req, res) => {
    const database = await db.check();
    if (!demoMode && !res.locals.identity) { res.json({ status: database.state === "connected" ? "ok" : "degraded", service: "prospectus-api" }); return; }
    // The API process is healthy even without a database; the database field is reported honestly.
    res.json({
      status: database.state === "connected" ? "ok" : "degraded",
      service: "prospectus-api",
      version: "0.1.0",
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database,
    });
  });
  return router;
}
