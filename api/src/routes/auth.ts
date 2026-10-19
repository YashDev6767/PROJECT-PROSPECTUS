import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError, parse } from "../http/errors.js";
import { SESSION_COOKIE, type Auth } from "../services/auth.js";

const body = z.object({ email: z.string().trim().min(1, "Enter your email").max(200), password: z.string().min(1, "Enter your password").max(200) });

/** Failed-attempt limiter: 8 failures per 15 minutes per client+email, in memory (resets on restart; enough for a restricted demo). */
function limiter(now: () => Date) {
  const hits = new Map<string, number[]>();
  const windowMs = 15 * 60_000, max = 8;
  const recent = (k: string) => { const t = now().getTime(); const list = (hits.get(k) ?? []).filter((x) => t - x < windowMs); hits.set(k, list); return list; };
  return { blocked: (k: string) => recent(k).length >= max, fail: (k: string) => { recent(k).push(now().getTime()); }, clear: (k: string) => hits.delete(k) };
}

export function authRouter(auth: Auth, allowDemoHeaders: boolean, now: () => Date): Router {
  const r = Router();
  const attempts = limiter(now);
  const cookieOptions = (maxAgeSeconds: number) => `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${auth.secureCookie ? "; Secure" : ""}`;

  /** What the browser needs to decide between the login page and the demo role picker. */
  r.get("/auth/config", (_req, res) => { res.json({ sessionLogin: auth.enabled, demoHeaders: allowDemoHeaders }); });

  r.get("/auth/session", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ user: auth.read(req.headers.cookie, now().getTime()) });
  });

  r.post("/auth/login", asyncHandler(async (req, res) => {
    if (!auth.enabled) throw new HttpError(503, "login_not_configured", "Sign-in is not configured on this server. The operator must set AUTH_USERS and SESSION_SECRET (see README).");
    const { email, password } = parse(body, req.body);
    const key = `${req.ip}|${email.toLowerCase()}`;
    if (attempts.blocked(key)) throw new HttpError(429, "too_many_attempts", "Too many failed sign-in attempts. Wait a few minutes and try again.");
    const user = auth.login(email, password);
    if (!user) { attempts.fail(key); throw new HttpError(401, "invalid_credentials", "Email or password is incorrect."); }
    attempts.clear(key);
    res.set("Cache-Control", "no-store");
    res.append("Set-Cookie", `${SESSION_COOKIE}=${auth.issue(user, now().getTime())}; ${cookieOptions(auth.ttlSeconds)}`);
    res.json({ user });
  }));

  r.post("/auth/logout", (req, res) => {
    auth.revoke(req.headers.cookie, now().getTime());
    res.append("Set-Cookie", `${SESSION_COOKIE}=; ${cookieOptions(0)}`);
    res.status(204).end();
  });

  return r;
}
