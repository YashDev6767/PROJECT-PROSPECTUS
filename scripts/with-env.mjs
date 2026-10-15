/** Runs a command with variables from the repo-root .env loaded: `node ../scripts/with-env.mjs prisma migrate deploy` */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const envFile = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
const env = { ...process.env };
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync("npx", ["--no-install", cmd, ...args], { stdio: "inherit", env });
process.exit(r.status ?? 1);
