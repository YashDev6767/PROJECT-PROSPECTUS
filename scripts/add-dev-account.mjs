#!/usr/bin/env node
/**
 * Adds (or replaces) one sign-in account in the local .env so the /login page can be used.
 *   npm run auth:add -- <email> <admin|campus_manager|faculty|student> '<passphrase, 10+ chars>' [facultyId | batchId]
 * The optional last argument is the faculty member's id (faculty accounts) or the batch id the student may see (student accounts).
 * Writes AUTH_USERS (scrypt hash only — the passphrase is never stored) and creates SESSION_SECRET if missing. .env is gitignored.
 * Restart the API afterwards (npm run dev).
 */
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [email, role, password, linkId] = process.argv.slice(2);
const roles = ["admin", "campus_manager", "faculty", "student"];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !roles.includes(role) || !password || password.length < 10) {
  console.error("Usage: npm run auth:add -- <email> <admin|campus_manager|faculty|student> '<passphrase of 10+ characters>' [facultyId | batchId]");
  process.exit(1);
}
const file = resolve(process.cwd(), ".env");
let text = existsSync(file) ? readFileSync(file, "utf8") : "";
const get = (k) => new RegExp(`^${k}=(.*)$`, "m").exec(text)?.[1];
const set = (k, v) => { text = new RegExp(`^${k}=`, "m").test(text) ? text.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : `${text.replace(/\n?$/, "\n")}${k}=${v}\n`; };

let users = [];
try { users = JSON.parse(get("AUTH_USERS") ?? "[]"); } catch { console.error("Existing AUTH_USERS in .env is not valid JSON; fix or remove it first."); process.exit(1); }
const salt = randomBytes(16);
const entry = { email: email.toLowerCase(), role, passwordHash: `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`, ...(linkId && role === "faculty" ? { facultyId: linkId } : {}), ...(linkId && role === "student" ? { batchId: linkId } : {}) };
set("AUTH_USERS", JSON.stringify([...users.filter((u) => u.email !== entry.email), entry]));
if (!get("SESSION_SECRET") || get("SESSION_SECRET").length < 32) set("SESSION_SECRET", randomBytes(32).toString("hex"));
writeFileSync(file, text);
console.log(`Saved ${entry.email} (${role}) to .env. Restart the API (npm run dev), then open http://localhost:5173/login`);
