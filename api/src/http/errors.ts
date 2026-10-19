import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodType } from "zod";
import type { Database } from "../db/client.js";
import { can, roleFromHeader, type Capability, type DemoRole } from "../domain/permissions.js";

export interface Issue { path: string; message: string }

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}

export const validationFailed = (issues: Issue[]) => new HttpError(400, "validation_failed", "The request has invalid fields", { issues });
export const notFound = (what: string) => new HttpError(404, "not_found", `${what} was not found`);
export const inUse = (message: string, blockers: Record<string, number>) => new HttpError(409, "in_use", message, { blockers });
/** The caller must resend with the confirm flag to proceed; nothing was changed. */
export const needsConfirmation = (warnings: Array<{ code: string; message: string }>) =>
  new HttpError(409, "needs_confirmation", "Confirmation required — resend the request with the confirm flag to proceed", { warnings });

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw validationFailed(zodIssues(result.error));
}
export const zodIssues = (e: ZodError): Issue[] => e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
export const failOnIssues = (issues: Issue[]) => { if (issues.length) throw validationFailed(issues); };

export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

/** Phase 2 data lives in PostgreSQL. Without a database these endpoints answer 503 rather than pretending. */
export function needDb(db: Database) {
  if (!db.prisma) throw new HttpError(503, "database_unavailable", "No database is configured. Set DATABASE_URL and start PostgreSQL (see README: npm run db:embedded or npm run db:up).");
  return db.prisma;
}

/** Who is calling, as established by the server: a verified session cookie, or (only when allowed) the spoofable demo headers. */
export interface Identity { source: "session" | "demo"; role: DemoRole; facultyId: string | null; email: string | null }

/**
 * Authorization: the signed session wins; the demo `X-Demo-Role` / `X-Demo-Faculty` headers are honoured only when the operator allows
 * them (default: development only, never production). Demo headers are NOT security — see domain/permissions.ts.
 */
export const requireCapability = (capability: Capability): RequestHandler => (req, res, next) => {
  const identity = res.locals.identity as Identity | undefined;
  if (!identity) {
    if (req.app.locals.allowDemoHeaders === false) return next(new HttpError(401, "unauthenticated", "Demo authentication headers (X-Demo-Role) are disabled in production mode. Production deployment requires server-verified authentication — sign in."));
    return next(new HttpError(401, "unauthenticated", "Not signed in: no valid session and no demo role was supplied (X-Demo-Role header)."));
  }
  if (!can(identity.role, capability)) return next(new HttpError(403, "forbidden", `The ${identity.role.replace("_", " ")} role cannot perform this action (${capability}).`));
  res.locals.role = identity.role;
  res.locals.facultyId = identity.facultyId;
  next();
};
/** The faculty member the caller acts as (verified for sessions; self-declared for demo headers). Call after requireCapability. */
export const callerFaculty = (res: Response): string | null => (res.locals.facultyId as string | null | undefined) ?? null;
export const callerRole = (res: Response): DemoRole | null => (res.locals.role as DemoRole | undefined) ?? null;

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = Array.isArray(err.meta?.target) ? (err.meta.target as string[]).join(", ") : "fields";
      res.status(409).json({ error: "duplicate", message: `A record with the same ${target} already exists.` });
      return;
    }
    if (err.code === "P2003") { res.status(409).json({ error: "in_use", message: "This record is referenced by other data and cannot be changed this way." }); return; }
    if (err.code === "P2025") { res.status(404).json({ error: "not_found", message: "Record not found" }); return; }
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    res.status(503).json({ error: "database_unavailable", message: "The database could not be reached." });
    return;
  }
  if (typeof err === "object" && err && "type" in err && (err as { type: string }).type === "entity.parse.failed") {
    res.status(400).json({ error: "invalid_json", message: "The request body is not valid JSON" });
    return;
  }
  if (typeof err === "object" && err && "type" in err && (err as { type: string }).type === "entity.too.large") {
    res.status(413).json({ error: "payload_too_large", message: "The request body is too large" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error", message: "Something went wrong on the server" });
};
