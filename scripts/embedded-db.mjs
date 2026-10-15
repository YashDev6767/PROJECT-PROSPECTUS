/**
 * Dev-only PostgreSQL without Docker: starts an embedded PostgreSQL server and keeps it running.
 *   node scripts/embedded-db.mjs [--port 5432] [--db prospectus] [--db prospectus_test] [--user prospectus] [--password dev-password]
 * Data lives in .pgdata/ (gitignored). Press Ctrl-C to stop. Not for production.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flagAll = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));

const port = Number(flag("port", process.env.POSTGRES_PORT ?? 5432));
const user = flag("user", process.env.POSTGRES_USER ?? "prospectus");
const password = flag("password", process.env.POSTGRES_PASSWORD ?? "change-me-locally");
const databases = flagAll("db").length ? flagAll("db") : [process.env.POSTGRES_DB ?? "prospectus", "prospectus_test"];
const dataDir = resolve(process.cwd(), ".pgdata");

const pg = new EmbeddedPostgres({ databaseDir: dataDir, user, password, port, persistent: true, onLog: () => {}, onError: console.error });

const fresh = !existsSync(resolve(dataDir, "PG_VERSION"));
if (fresh) await pg.initialise();
await pg.start();
for (const db of databases) {
  try { await pg.createDatabase(db); } catch (e) { if (!String(e).includes("already exists")) throw e; }
}
console.log(`Embedded PostgreSQL ready on localhost:${port} (user "${user}", databases: ${databases.join(", ")}). Ctrl-C to stop.`);

const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
