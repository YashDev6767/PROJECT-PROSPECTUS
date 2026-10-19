/**
 * Campus-level data isolation (server-side, central).
 *
 * Every authenticated caller has a Scope: either ALL campuses (organization-wide administrators) or an explicit set of campus ids.
 * It is derived from trusted server-side facts, never from request fields:
 *   admin           organization-wide unless the account is configured with `campusIds` (then limited to those)
 *   campus_manager  the account's configured `campusIds` — none configured = no access (fail closed)
 *   faculty         the campus of the faculty record the account is linked to (looked up in the database)
 *   student         the campus of the batch the account is linked to (looked up in the database)
 *   demo headers    development only: `X-Demo-Campus` if sent, otherwise all (demo headers are spoofable by design and off in production)
 * An empty scope can read and write nothing: the request gate answers 403 `no_campus_assigned` before any route runs.
 *
 * Routes use three helpers, chosen by what the request names:
 *   campusWhere()          list / export: restrict the database query itself (a named campus must be in scope, else 403 forbidden_campus)
 *   assertCampus()         a campus the request names or would write to (body/query): not in scope -> 403 forbidden_campus
 *   hideOutOfScope()       a resource reached by id: not in scope -> 404, indistinguishable from a missing record
 */
import type { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { campuses } from "../data/campuses.js";
import type { DemoRole } from "../domain/permissions.js";
import { HttpError, notFound } from "./errors.js";

export const knownCampusIds: string[] = campuses.map((c) => c.id);
export interface Scope { all: boolean; campuses: ReadonlySet<string> }
export const ALL_CAMPUSES: Scope = { all: true, campuses: new Set(knownCampusIds) };
export const NO_CAMPUSES: Scope = { all: false, campuses: new Set() };
const only = (ids: Iterable<string>): Scope => ({ all: false, campuses: new Set([...ids].filter((c) => knownCampusIds.includes(c))) });
export const isEmpty = (s: Scope) => !s.all && s.campuses.size === 0;

interface ScopeInput { role: DemoRole; source: "session" | "demo"; campusIds: string[] | null; facultyId: string | null; batchId: string | null; demoCampusHeader?: string | undefined }

/** Resolves the caller's campus scope from trusted data. Unknown, missing or unresolvable membership yields an EMPTY scope. */
export async function resolveScope(prisma: PrismaClient | null, i: ScopeInput): Promise<Scope> {
  if (i.source === "demo") {
    if (i.demoCampusHeader === undefined || i.demoCampusHeader.trim() === "") return ALL_CAMPUSES; // development convenience; the whole demo mode is spoofable and disabled in production
    return only(i.demoCampusHeader.split(",").map((s) => s.trim()));
  }
  if (i.role === "admin") return i.campusIds === null ? ALL_CAMPUSES : only(i.campusIds);
  if (i.role === "campus_manager") return i.campusIds === null ? NO_CAMPUSES : only(i.campusIds);
  if (!prisma) return NO_CAMPUSES;
  if (i.role === "faculty") {
    const f = i.facultyId ? await prisma.faculty.findUnique({ where: { id: i.facultyId }, select: { campusId: true } }) : null;
    return f ? only([f.campusId]) : NO_CAMPUSES;
  }
  const b = i.batchId ? await prisma.batch.findUnique({ where: { id: i.batchId }, select: { semester: { select: { campusId: true } } } }) : null;
  return b ? only([b.semester.campusId]) : NO_CAMPUSES;
}

export const scopeOf = (res: Response): Scope => {
  const id = res.locals.identity as { scope?: Scope } | undefined;
  if (id?.scope) return id.scope;
  return (res.req as Request).app.locals.allowDemoHeaders === false ? NO_CAMPUSES : ALL_CAMPUSES; // anonymous reads exist only in development demo mode
};
export const inScope = (scope: Scope, campusId: string | null | undefined) => campusId != null && (scope.all || scope.campuses.has(campusId));

const forbiddenCampus = () => new HttpError(403, "forbidden_campus", "Your account is not allowed to access that campus.");

/** A campus named by the request (query, body, URL) or about to be written to. */
export function assertCampus(res: Response, campusId: string): void {
  if (!inScope(scopeOf(res), campusId)) throw forbiddenCampus();
}

/** Prisma filter for `campusId`: the named campus (checked), or every campus the caller may see. `undefined` = unrestricted. */
export function campusWhere(res: Response, requested?: string): string | { in: string[] } | undefined {
  const s = scopeOf(res);
  if (requested !== undefined) { assertCampus(res, requested); return requested; }
  return s.all ? undefined : { in: [...s.campuses] };
}

/** A record reached by id whose campus is not in scope behaves exactly like a missing record. */
export function hideOutOfScope(res: Response, campusId: string | null | undefined, what: string): void {
  if (!inScope(scopeOf(res), campusId)) throw notFound(what);
}

/** Campus-less (institution-wide) records, e.g. national holidays: readable by everyone, changeable only with organization-wide scope. */
export function assertOrganizationWide(res: Response): void {
  if (!scopeOf(res).all) throw new HttpError(403, "forbidden_campus", "Institution-wide entries can only be changed by organization-wide administrators.");
}

/** The campuses to use when a report/dashboard needs ONE campus and the request did not name it. */
export function defaultCampus(res: Response, requested: string | undefined): string | { error: HttpError } | undefined {
  if (requested !== undefined) { assertCampus(res, requested); return requested; }
  const s = scopeOf(res);
  if (s.all) return undefined;
  if (s.campuses.size === 1) return [...s.campuses][0];
  return { error: new HttpError(400, "validation_failed", "The request has invalid fields", { issues: [{ path: "campusId", message: "Choose a campus" }] }) };
}
