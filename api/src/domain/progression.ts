/**
 * Progression domain logic — pure functions, no I/O.
 * Phase 1 uses a deliberately simple, explainable model; Phase 3 will refine it with
 * calendar-based planned dates (holidays, exam breaks) and tested edge cases.
 */

export type RiskLevel = "on_track" | "at_risk" | "critical";

export interface SubjectProgressInput {
  plannedHours: number; // total syllabus hours for the semester
  plannedHoursToDate: number; // hours the timetable says should be delivered by today
  deliveredHours: number; // hours actually logged
  hoursPerWeek: number; // remaining weekly teaching capacity
  daysToExam: number | null; // null when no exam is scheduled
}

export interface SubjectProgress {
  coveragePct: number;
  expectedPct: number;
  hoursBehind: number; // >= 0
  remainingHours: number;
  capacityBeforeExam: number | null;
  risk: RiskLevel;
}

const AT_RISK_GAP_PCT = 10;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function evaluateSubject(input: SubjectProgressInput): SubjectProgress {
  const { plannedHours, plannedHoursToDate, deliveredHours, hoursPerWeek, daysToExam } = input;
  if (plannedHours <= 0) throw new RangeError("plannedHours must be greater than zero");
  if ([plannedHoursToDate, deliveredHours, hoursPerWeek].some((n) => n < 0)) {
    throw new RangeError("hours values cannot be negative");
  }

  const coveragePct = clamp((deliveredHours / plannedHours) * 100, 0, 100);
  const expectedPct = clamp((plannedHoursToDate / plannedHours) * 100, 0, 100);
  const hoursBehind = Math.max(0, plannedHoursToDate - deliveredHours);
  const remainingHours = Math.max(0, plannedHours - deliveredHours);
  const capacityBeforeExam = daysToExam === null ? null : (Math.max(0, daysToExam) / 7) * hoursPerWeek;

  let risk: RiskLevel = "on_track";
  if (capacityBeforeExam !== null && remainingHours > capacityBeforeExam) {
    risk = "critical"; // even full-capacity teaching cannot cover the syllabus before the exam
  } else if (expectedPct - coveragePct >= AT_RISK_GAP_PCT) {
    risk = "at_risk";
  }

  return {
    coveragePct: round1(coveragePct),
    expectedPct: round1(expectedPct),
    hoursBehind: round1(hoursBehind),
    remainingHours: round1(remainingHours),
    capacityBeforeExam: capacityBeforeExam === null ? null : round1(capacityBeforeExam),
    risk,
  };
}

export const riskRank: Record<RiskLevel, number> = { critical: 0, at_risk: 1, on_track: 2 };

export function daysBetween(from: Date, to: Date): number {
  const MS = 86_400_000;
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / MS);
}
