import type { Role } from "./roles";

/** Mirrors api/src/domain/permissions.ts. UI hints only — the API makes the actual (demo) decision. */
export type Capability = "semesters:write" | "academic:write" | "special_working_day:write" | "sessions:read" | "sessions:write" | "sessions:review" | "reports:read" | "portal:read";
const matrix: Record<Capability, Role[]> = {
  "semesters:write": ["admin"],
  "academic:write": ["admin", "campus_manager"],
  "special_working_day:write": ["admin", "campus_manager"],
  "sessions:read": ["admin", "campus_manager", "faculty"],
  "sessions:write": ["admin", "campus_manager", "faculty"],
  "sessions:review": ["admin", "campus_manager"],
  "reports:read": ["admin", "campus_manager", "faculty"],
  "portal:read": ["admin", "campus_manager", "faculty", "student"],
};
export const can = (role: Role, capability: Capability) => matrix[capability].includes(role);
