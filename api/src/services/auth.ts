/**
 * Restricted evaluation sign-in: a small, server-verified session mechanism for hackathon / staging use.
 *
 *  - Accounts are configured by the OPERATOR in the environment (AUTH_USERS, a JSON array). There is no sign-up and no database
 *    table; passwords are never stored in the repository, only scrypt hashes in the operator's .env (see `npm run auth:hash`).
 *  - A successful sign-in sets an HttpOnly, SameSite=Lax cookie holding a payload signed with HMAC-SHA256 (SESSION_SECRET).
 *    The role and faculty identity come from that signed cookie, never from anything the browser can edit.
 *  - This is deliberately NOT an identity platform: no password reset, no SSO, no MFA, no per-user audit beyond the role.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { DemoRole } from "../domain/permissions.js";

export const SESSION_COOKIE = "prospectus_session";

const userSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["admin", "campus_manager", "faculty", "student"]),
  name: z.string().trim().max(80).optional(),
  facultyId: z.string().trim().min(1).max(64).optional(),
  passwordHash: z.string().regex(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/, "passwordHash must come from `npm run auth:hash`"),
});
export type AuthUser = z.infer<typeof userSchema>;
export interface SessionUser { email: string; role: DemoRole; name: string | null; facultyId: string | null }

/** Same format the `npm run auth:hash` script writes: scrypt:<16-byte salt hex>:<64-byte hash hex>. */
export function hashPassword(password: string, salt: Buffer = randomBytes(16)): string {
  return `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string): boolean {
  const [, saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest();

export interface AuthConfigInput { AUTH_USERS?: string | undefined; SESSION_SECRET?: string | undefined; SESSION_TTL_HOURS?: number | undefined; NODE_ENV?: string | undefined }

export interface Auth {
  enabled: boolean;
  secureCookie: boolean;
  ttlSeconds: number;
  login(email: string, password: string): SessionUser | null;
  issue(user: SessionUser, nowMs: number): string;
  read(cookieHeader: string | undefined, nowMs: number): SessionUser | null;
  /** Logout: the presented token stops working immediately (not just in the browser). In memory — cleared on restart. */
  revoke(cookieHeader: string | undefined, nowMs: number): void;
}

/** Throws with an operator-readable message when the configuration is unsafe or malformed (fail closed at startup). */
export function createAuth(input: AuthConfigInput): Auth {
  const raw = input.AUTH_USERS?.trim();
  const ttlSeconds = Math.round((input.SESSION_TTL_HOURS ?? 8) * 3600);
  const secureCookie = input.NODE_ENV === "production";
  if (!raw) return { enabled: false, secureCookie, ttlSeconds, login: () => null, issue: () => "", read: () => null, revoke: () => undefined };

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("AUTH_USERS must be valid JSON (an array of {email, role, passwordHash})"); }
  const users = z.array(userSchema).min(1).max(50).safeParse(parsed);
  if (!users.success) throw new Error(`AUTH_USERS is invalid — ${users.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const secret = input.SESSION_SECRET ?? "";
  if (secret.length < 32) throw new Error("SESSION_SECRET (at least 32 random characters) is required when AUTH_USERS is set");
  const byEmail = new Map(users.data.map((u) => [u.email, u]));
  const dummy = hashPassword("not-a-real-password"); // equalises timing for unknown emails
  const revoked = new Map<string, number>(); // token id -> expiry (seconds)
  const tokenOf = (cookieHeader: string | undefined) => cookieHeader?.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  const verify = (token: string | undefined) => {
    if (!token) return null;
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = mac(secret, body), given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try { return JSON.parse(Buffer.from(body, "base64url").toString()) as { e: string; r: DemoRole; n?: string | null; f?: string | null; x: number; j?: string }; } catch { return null; }
  };

  return {
    enabled: true, secureCookie, ttlSeconds,
    login(email, password) {
      const user = byEmail.get(email.trim().toLowerCase());
      const ok = verifyPassword(password, user?.passwordHash ?? dummy);
      return user && ok ? { email: user.email, role: user.role, name: user.name ?? null, facultyId: user.facultyId ?? null } : null;
    },
    issue(user, nowMs) {
      const body = b64(JSON.stringify({ e: user.email, r: user.role, n: user.name, f: user.facultyId, x: Math.floor(nowMs / 1000) + ttlSeconds, j: randomBytes(12).toString("hex") }));
      return `${body}.${b64(mac(secret, body))}`;
    },
    read(cookieHeader, nowMs) {
      const p = verify(tokenOf(cookieHeader));
      if (!p) return null;
      const user = byEmail.get(p.e);
      if (!user || p.x * 1000 < nowMs || user.role !== p.r || (p.j && revoked.has(p.j))) return null; // unknown/changed accounts, expired or logged-out sessions
      return { email: user.email, role: user.role, name: user.name ?? null, facultyId: user.facultyId ?? null };
    },
    revoke(cookieHeader, nowMs) {
      const p = verify(tokenOf(cookieHeader));
      for (const [id, exp] of revoked) if (exp * 1000 < nowMs) revoked.delete(id); // prune
      if (p?.j) revoked.set(p.j, p.x);
    },
  };
}
