#!/usr/bin/env node
/**
 * Adds (or replaces) one sign-in account in the local .env so the /login page can be used.
 *   npm run auth:add -- <email> <admin|campus_manager|faculty|student> '<passphrase, 10+ chars>' [campusIds | facultyId | batchId]
 * The optional last argument depends on the role:
 *   campus_manager  REQUIRED: the campus id(s) the manager works in, comma-separated (rgib,juj). Without it the account can access nothing.
 *   admin           optional campus id(s): omit for an organization-wide administrator, give some to limit the account to those campuses.
 *   faculty         the faculty member's id; their campus is taken from that record.
 *   student         the batch id the student may see; their campus is taken from that batch.
 * Writes AUTH_USERS (scrypt hash only — the passphrase is never stored) and creates SESSION_SECRET if missing. .env is gitignored.
 * Restart the API afterwards (npm run dev).
 */
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [email, role, password, linkId] = process.argv.slice(2);
const roles = ["admin", "campus_manager", "faculty", "student"];
if (role === "campus_manager" && !linkId) { console.error("A campus manager needs campus ids (comma-separated), e.g. rgib or rgib,juj. Without them the account could access nothing."); process.exit(1); }
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
const entry = { email: email.toLowerCase(), role, passwordHash: `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`, ...(linkId && role === "faculty" ? { facultyId: linkId } : {}), ...(linkId && role === "student" ? { batchId: linkId } : {}), ...(linkId && (role === "campus_manager" || role === "admin") ? { campusIds: linkId.split(",").map((c) => c.trim()).filter(Boolean) } : {}) };
set("AUTH_USERS", JSON.stringify([...users.filter((u) => u.email !== entry.email), entry]));
if (!get("SESSION_SECRET") || get("SESSION_SECRET").length < 32) set("SESSION_SECRET", randomBytes(32).toString("hex"));
writeFileSync(file, text);
console.log(`Saved ${entry.email} (${role}) to .env. Restart the API (npm run dev), then open http://localhost:5173/login`);
