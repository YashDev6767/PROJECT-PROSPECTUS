import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createDatabase } from "./db/client.js";

const env = loadEnv();
const db = createDatabase(env.DATABASE_URL);
const app = createApp(env, db);

const server = app.listen(env.API_PORT, async () => {
  const status = await db.check();
  console.log(`PROSPECTUS API listening on http://localhost:${env.API_PORT}`);
  console.log(`Database: ${status.state}${"detail" in status ? ` (${status.detail})` : ""}`);
  console.log("Dashboard data source: DEMO dataset (not persisted)");
});

const shutdown = () => server.close(() => db.close().finally(() => process.exit(0)));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
