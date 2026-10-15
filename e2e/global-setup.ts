import { execSync } from "node:child_process";
import { resolve } from "node:path";

/** Resets the test database and loads sample data so Phase 2 specs start from a known state. */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) { console.log("[e2e] TEST_DATABASE_URL not set — database-backed specs will be skipped."); return; }
  const api = resolve(__dirname, "../api");
  const env = { ...process.env, DATABASE_URL: url };
  const run = (cmd: string) => execSync(cmd, { cwd: api, env, stdio: "pipe" });
  run("npx prisma migrate deploy");
  run("npx tsx prisma/reset-academic.ts");
  run("npx tsx prisma/seed.ts");
}
