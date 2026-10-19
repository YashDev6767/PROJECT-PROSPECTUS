/**
 * DEMO-ONLY permission model. Until real authentication ships (Phase 4) the API reads the caller's role from
 * the `X-Demo-Role` header. Anyone can send any header, so this is NOT security — it keeps the permission
 * boundaries and error handling in place so real auth can replace `roleFromHeader` without touching routes.
 */
export type DemoRole = "admin" | "campus_manager" | "faculty" | "student";
export type Capability = "semesters:write" | "academic:write" | "special_working_day:write" | "sessions:read" | "sessions:write" | "sessions:review" | "reports:read" | "portal:read";

const matrix: Record<Capability, DemoRole[]> = {
  "semesters:write": ["admin"],
  "academic:write": ["admin", "campus_manager"],
  "special_working_day:write": ["admin", "campus_manager"],
  // Session logs: faculty may log/correct only for subjects assigned to the faculty member they are acting as (checked in the route).
  "sessions:read": ["admin", "campus_manager", "faculty"],
  "sessions:write": ["admin", "campus_manager", "faculty"],
  "sessions:review": ["admin", "campus_manager"],
  "reports:read": ["admin", "campus_manager", "faculty"],
  // The student learning portal. A student is bound to ONE batch by the server; staff must name the batch they want to look at.
  "portal:read": ["admin", "campus_manager", "faculty", "student"],
};

export const can = (role: DemoRole | null, capability: Capability) => role !== null && matrix[capability].includes(role);

const allRoles: DemoRole[] = ["admin", "campus_manager", "faculty", "student"];
export const roleFromHeader = (value: unknown): DemoRole | null =>
  typeof value === "string" ? allRoles.find((r) => r === value) ?? null : null;
