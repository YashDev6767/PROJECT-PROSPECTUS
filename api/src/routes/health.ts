import { Router } from "express";
import type { Database } from "../db/client.js";

export function healthRouter(db: Database): Router {
  const router = Router();
  router.get("/health", async (_req, res) => {
    const database = await db.check();
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
