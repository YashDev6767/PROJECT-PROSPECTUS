import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import type { Database } from "./db/client.js";
import { createAuth, hashPassword, verifyPassword } from "./services/auth.js";

const noDb: Database = { prisma: null, check: async () => ({ state: "not_configured", detail: "x" }), close: async () => {} };
const SECRET = "x".repeat(40);
const hash = (pw: string) => hashPassword(pw);
const users = JSON.stringify([
  { email: "admin@msot.test", role: "admin", name: "Test Admin", passwordHash: hash("admin-passphrase-1") },
  { email: "student@msot.test", role: "student", passwordHash: hash("student-passphrase-1") },
  { email: "fac@msot.test", role: "faculty", facultyId: "fac-1", passwordHash: hash("faculty-passphrase-1") },
]);
let clock = new Date("2026-10-19T10:00:00Z");
const app = (extra: Record<string, unknown> = {}) => createApp({ CORS_ORIGIN: "http://localhost:5173", AUTH_USERS: users, SESSION_SECRET: SECRET, ...extra } as never, noDb, () => clock);
const login = async (a: ReturnType<typeof app>, email: string, password: string) => request(a).post("/api/auth/login").send({ email, password });
const cookieOf = (res: request.Response) => String(res.headers["set-cookie"]?.[0] ?? "").split(";")[0]!;
const semester = { name: "S", academicYear: "2026-27", track: "MIRAI", campusId: "hi-tech", startsOn: "2026-08-03", endsOn: "2026-12-18" };

describe("restricted evaluation sign-in", () => {
  it("hashes with scrypt, verifies, and rejects wrong passwords; the CLI script writes the same format", () => {
    const h = hashPassword("correct horse battery");
    expect(h).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(verifyPassword("correct horse battery", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    const fromScript = execFileSync("node", [fileURLToPath(new URL("../../scripts/hash-password.mjs", import.meta.url)), "a-long-enough-pass"]).toString().trim();
    expect(verifyPassword("a-long-enough-pass", fromScript)).toBe(true);
    expect(() => execFileSync("node", [fileURLToPath(new URL("../../scripts/hash-password.mjs", import.meta.url)), "short"], { stdio: "pipe" })).toThrow();
  });

  it("signs in with a correct password and sets an HttpOnly, SameSite=Lax cookie (Secure in production)", async () => {
    const res = await login(app(), "ADMIN@msot.test", "admin-passphrase-1"); // email is case-insensitive
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ email: "admin@msot.test", role: "admin", name: "Test Admin", facultyId: null });
    expect(res.body.user.passwordHash).toBeUndefined();
    const flags = String(res.headers["set-cookie"]);
    expect(flags).toMatch(/HttpOnly/); expect(flags).toMatch(/SameSite=Lax/); expect(flags).toMatch(/Max-Age=28800/); expect(flags).not.toMatch(/Secure/);
    const prod = await login(app({ NODE_ENV: "production", ALLOW_DEMO_HEADERS: false }), "admin@msot.test", "admin-passphrase-1");
    expect(String(prod.headers["set-cookie"])).toMatch(/Secure/);
  });

  it("gives one generic error for a wrong password and an unknown email, and validates the body", async () => {
    const a = app();
    const wrong = await login(a, "admin@msot.test", "nope-nope-nope");
    const unknown = await login(a, "nobody@msot.test", "nope-nope-nope");
    expect(wrong.status).toBe(401); expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.message).toBe("Email or password is incorrect.");
    expect(wrong.headers["set-cookie"]).toBeUndefined();
    const bad = await request(a).post("/api/auth/login").send({ email: "", password: "" });
    expect(bad.status).toBe(400); expect(bad.body.issues.map((i: { path: string }) => i.path).sort()).toEqual(["email", "password"]);
  });

  it("locks out repeated failures for the same client and email (429), without affecting others", async () => {
    const a = app();
    for (let i = 0; i < 8; i++) expect((await login(a, "student@msot.test", "bad-bad-bad-bad")).status).toBe(401);
    const blocked = await login(a, "student@msot.test", "student-passphrase-1");
    expect(blocked.status).toBe(429); expect(blocked.body.error).toBe("too_many_attempts");
    expect((await login(a, "admin@msot.test", "admin-passphrase-1")).status).toBe(200);
  });

  it("a valid session carries the role: admin passes the capability check, student is forbidden, anonymous is 401", async () => {
    const a = app();
    const admin = cookieOf(await login(a, "admin@msot.test", "admin-passphrase-1"));
    const student = cookieOf(await login(a, "student@msot.test", "student-passphrase-1"));
    expect((await request(a).get("/api/auth/session").set("Cookie", admin)).body.user.role).toBe("admin");
    expect((await request(a).get("/api/auth/session")).body.user).toBeNull();
    const asAdmin = await request(a).post("/api/semesters").set("Cookie", admin).send(semester);
    expect(asAdmin.status).toBe(503); expect(asAdmin.body.error).toBe("database_unavailable"); // reached the handler: authorised
    expect((await request(a).post("/api/semesters").set("Cookie", student).send(semester)).status).toBe(403);
    expect((await request(a).post("/api/semesters").send(semester)).status).toBe(401);
  });

  it("a signed-in user cannot elevate themselves with demo headers", async () => {
    const a = app();
    const student = cookieOf(await login(a, "student@msot.test", "student-passphrase-1"));
    const res = await request(a).post("/api/semesters").set("Cookie", student).set("X-Demo-Role", "admin").send(semester);
    expect(res.status).toBe(403);
  });

  it("rejects tampered, forged, wrong-secret and expired cookies", async () => {
    const a = app();
    const good = cookieOf(await login(a, "student@msot.test", "student-passphrase-1"));
    const [name, token] = [good.split("=")[0], good.split("=").slice(1).join("=")];
    const [body, sig] = token!.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ e: "student@msot.test", r: "admin", x: 9999999999 })).toString("base64url");
    for (const bad of [`${name}=${forgedBody}.${sig}`, `${name}=${body}.AAAA`, `${name}=garbage`, `${name}=`]) {
      expect((await request(a).get("/api/auth/session").set("Cookie", bad)).body.user).toBeNull();
      expect((await request(a).post("/api/semesters").set("Cookie", bad).send(semester)).status).toBe(401);
    }
    const otherSecret = app({ SESSION_SECRET: "y".repeat(40) });
    expect((await request(otherSecret).get("/api/auth/session").set("Cookie", good)).body.user).toBeNull();
    clock = new Date("2026-10-19T19:00:00Z"); // 9 h later: past the 8 h lifetime
    expect((await request(a).get("/api/auth/session").set("Cookie", good)).body.user).toBeNull();
    clock = new Date("2026-10-19T10:00:00Z");
  });

  it("in production the demo headers stay off but a real session works; logout clears the cookie", async () => {
    const a = app({ NODE_ENV: "production", ALLOW_DEMO_HEADERS: false });
    expect((await request(a).post("/api/semesters").set("X-Demo-Role", "admin").send(semester)).status).toBe(401);
    const admin = cookieOf(await login(a, "admin@msot.test", "admin-passphrase-1"));
    expect((await request(a).post("/api/semesters").set("Cookie", admin).send(semester)).status).toBe(503);
    const out = await request(a).post("/api/auth/logout");
    expect(out.status).toBe(204); expect(String(out.headers["set-cookie"])).toMatch(/Max-Age=0/);
    expect((await request(a).get("/api/auth/config")).body).toEqual({ sessionLogin: true, demoHeaders: false });
  });

  it("production read gate: a session unlocks reads, anonymous and logged-out tokens do not", async () => {
    const a = app({ NODE_ENV: "production", ALLOW_DEMO_HEADERS: false });
    expect((await request(a).get("/api/dashboard?campusId=hi-tech")).status).toBe(401);
    const student = cookieOf(await login(a, "student@msot.test", "student-passphrase-1"));
    expect((await request(a).get("/api/dashboard?campusId=hi-tech").set("Cookie", student)).status).toBe(200);
    expect((await request(a).get("/api/meta")).status).toBe(200);
  });

  it("logout revokes the token itself: replaying the old cookie after sign-out fails", async () => {
    const a = app();
    const good = cookieOf(await login(a, "admin@msot.test", "admin-passphrase-1"));
    const other = cookieOf(await login(a, "admin@msot.test", "admin-passphrase-1")); // a second session is unaffected
    expect((await request(a).get("/api/auth/session").set("Cookie", good)).body.user).not.toBeNull();
    expect((await request(a).post("/api/auth/logout").set("Cookie", good)).status).toBe(204);
    expect((await request(a).get("/api/auth/session").set("Cookie", good)).body.user).toBeNull();
    expect((await request(a).post("/api/semesters").set("Cookie", good).send(semester)).status).toBe(401);
    expect((await request(a).get("/api/auth/session").set("Cookie", other)).body.user).not.toBeNull();
  });

  it("without AUTH_USERS there is no login (honest 503) and the config says so", async () => {
    const a = createApp({ CORS_ORIGIN: "http://localhost:5173", NODE_ENV: "production", ALLOW_DEMO_HEADERS: false } as never, noDb, () => clock);
    const res = await request(a).post("/api/auth/login").send({ email: "a@b.co", password: "whatever-pass" });
    expect(res.status).toBe(503); expect(res.body.error).toBe("login_not_configured");
    expect((await request(a).get("/api/auth/config")).body).toEqual({ sessionLogin: false, demoHeaders: false });
  });

  it("refuses unsafe configuration at startup", () => {
    expect(() => createAuth({ AUTH_USERS: "not json", SESSION_SECRET: SECRET })).toThrow(/valid JSON/);
    expect(() => createAuth({ AUTH_USERS: JSON.stringify([{ email: "a@b.co", role: "admin", passwordHash: "plaintext" }]), SESSION_SECRET: SECRET })).toThrow(/npm run auth:hash/);
    expect(() => createAuth({ AUTH_USERS: users, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
    expect(() => createAuth({ AUTH_USERS: JSON.stringify([{ email: "a@b.co", role: "owner", passwordHash: hash("x") }]), SESSION_SECRET: SECRET })).toThrow();
    expect(loadEnv({ AUTH_USERS: users, SESSION_SECRET: SECRET } as NodeJS.ProcessEnv).SESSION_TTL_HOURS).toBe(8);
  });
});
