import { rangesOverlap, type ISODate } from "./dates.js";

export type Track = "MIRAI" | "UNIVERSITY";
export type SemesterStatus = "upcoming" | "active" | "completed";

export interface SemesterRange { id?: string; campusId: string; track: Track; startsOn: ISODate; endsOn: ISODate; name?: string }

export const validateDateRange = (startsOn: ISODate, endsOn: ISODate): string | null =>
  endsOn < startsOn ? "End date cannot be before the start date" : null;

/** "2026-27": second half must be the year after the first. */
export function validateAcademicYear(value: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return 'Use the format "2026-27"';
  return (Number(m[1]) + 1) % 100 === Number(m[2]) ? null : `"${value}" is not consecutive years (expected ${m[1]}-${String((Number(m[1]) + 1) % 100).padStart(2, "0")})`;
}

/** Other semesters for the same campus + track whose dates intersect the candidate. */
export const findSemesterOverlaps = <T extends SemesterRange>(candidate: SemesterRange, existing: T[]): T[] =>
  existing.filter((s) => s.id !== candidate.id && s.campusId === candidate.campusId && s.track === candidate.track && rangesOverlap(s.startsOn, s.endsOn, candidate.startsOn, candidate.endsOn));

/**
 * Completed once the end date has passed. Active only when it is activated AND today is within its dates.
 * Anything else (future, or in-window but not yet activated) is Upcoming.
 */
export function semesterStatus(s: { startsOn: ISODate; endsOn: ISODate; isActive: boolean }, today: ISODate): SemesterStatus {
  if (today > s.endsOn) return "completed";
  if (s.isActive && today >= s.startsOn) return "active";
  return "upcoming";
}
