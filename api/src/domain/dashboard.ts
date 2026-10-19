import type { DemoCampus, DemoScheduleItem, DemoSessionLog, DemoSubject } from "../data/demo.js";
import type { RiskStatus } from "./progress.js";
import { daysBetween, evaluateSubject, riskRank, type RiskLevel } from "./progression.js";

export interface DashboardSource {
  campuses: DemoCampus[];
  semester: { id: string; name: string };
  subjects: DemoSubject[];
  schedule: DemoScheduleItem[];
  sessions: DemoSessionLog[];
}

export interface SubjectRow {
  id: string; code: string; name: string; faculty: string;
  coveragePct: number; expectedPct: number; hoursBehind: number; risk: RiskLevel; daysToExam: number | null;
  // present for live (database) rows only
  status?: RiskStatus; reason?: string; bufferRatio?: number | null; batchName?: string; track?: string;
  remainingHours?: number; availableHours?: number | null; deadline?: string;
}

export interface UpcomingExam { id: string; name: string; examDate: string; daysToExam: number | null; subtitle?: string; risk?: RiskLevel }

export interface DashboardSession { id: string; subject: string; code: string; start: string; end: string; room: string; state: "logged" | "needs_log" | "upcoming"; subjectId?: string; outcome?: string }

/**
 * What the live numbers can honestly say. `ready` is the only state in which an empty at-risk list means "nothing is at risk";
 * every other state means the academic situation could not be assessed and the UI must not look reassuring.
 */
export type DashboardStateKind = "ready" | "no_active_semester" | "no_subjects" | "needs_data";
export interface DashboardState {
  kind: DashboardStateKind;
  message: string;
  subjects: number; // subjects in the active semesters
  assessed: number; // subjects with a real status (not UNKNOWN)
  unassessed: number; // UNKNOWN: no syllabus hours or no deadline
}

export interface Dashboard {
  /** "demo" = built-in sample numbers (no database rows); "live" = computed from persisted timetable, logs and syllabus. */
  dataSource: "demo" | "live";
  overall?: { status: RiskStatus | null; worstSubject: { id: string; name: string; batchName: string } | null; byTrack: Array<{ track: string; status: RiskStatus }> };
  /** live payloads only */
  state?: DashboardState;
  generatedAt: string;
  campuses: DemoCampus[];
  context: { campus: DemoCampus; semester: string; today: string };
  metrics: { overallCoveragePct: number; hoursBehind: number; subjectsAtRisk: number; nextExamInDays: number | null };
  schedule: DashboardSession[];
  atRisk: SubjectRow[];
  exams: UpcomingExam[];
  recentSessions: Array<{ id: string; subject: string; code: string; faculty: string; hours: number; topics: string; date: string }>;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function buildDashboard(source: DashboardSource, campusId: string, today: Date): Dashboard | null {
  const campus = source.campuses.find((c) => c.id === campusId);
  if (!campus) return null;

  const subjects = source.subjects.filter((s) => s.campusId === campus.id);
  const byId = new Map(subjects.map((s) => [s.id, s]));

  const rows = subjects.map((s): SubjectRow & { examDate: string | null } => {
    const daysToExam = s.examOffsetDays;
    const p = evaluateSubject({
      plannedHours: s.plannedHours, plannedHoursToDate: s.plannedHoursToDate,
      deliveredHours: s.deliveredHours, hoursPerWeek: s.hoursPerWeek, daysToExam,
    });
    return {
      id: s.id, code: s.code, name: s.name, faculty: s.faculty,
      coveragePct: p.coveragePct, expectedPct: p.expectedPct, hoursBehind: p.hoursBehind, risk: p.risk,
      daysToExam, examDate: daysToExam === null ? null : isoDate(addDays(today, daysToExam)),
    };
  });

  const totalPlanned = subjects.reduce((n, s) => n + s.plannedHours, 0);
  const totalDelivered = subjects.reduce((n, s) => n + Math.min(s.deliveredHours, s.plannedHours), 0);
  const upcoming = rows.filter((r) => r.daysToExam !== null && r.daysToExam >= 0);

  return {
    dataSource: "demo",
    generatedAt: new Date().toISOString(),
    campuses: source.campuses,
    context: { campus, semester: source.semester.name, today: isoDate(today) },
    metrics: {
      overallCoveragePct: totalPlanned ? Math.round((totalDelivered / totalPlanned) * 1000) / 10 : 0,
      hoursBehind: Math.round(rows.reduce((n, r) => n + r.hoursBehind, 0) * 10) / 10,
      subjectsAtRisk: rows.filter((r) => r.risk !== "on_track").length,
      nextExamInDays: upcoming.length ? Math.min(...upcoming.map((r) => r.daysToExam as number)) : null,
    },
    schedule: source.schedule
      .filter((t) => t.campusId === campus.id && byId.has(t.subjectId))
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((t) => ({ id: t.id, subject: byId.get(t.subjectId)!.name, code: byId.get(t.subjectId)!.code, start: t.start, end: t.end, room: t.room, state: t.state })),
    atRisk: rows
      .filter((r) => r.risk !== "on_track")
      .sort((a, b) => riskRank[a.risk] - riskRank[b.risk] || b.hoursBehind - a.hoursBehind),
    exams: upcoming
      .sort((a, b) => (a.daysToExam as number) - (b.daysToExam as number))
      .map((r) => ({ id: r.id, name: r.name, examDate: r.examDate as string, daysToExam: r.daysToExam, risk: r.risk })),
    recentSessions: source.sessions
      .filter((l) => l.campusId === campus.id && byId.has(l.subjectId))
      .sort((a, b) => b.dayOffset - a.dayOffset)
      .map((l) => ({
        id: l.id, subject: byId.get(l.subjectId)!.name, code: byId.get(l.subjectId)!.code,
        faculty: l.faculty, hours: l.hours, topics: l.topics, date: isoDate(addDays(today, l.dayOffset)),
      })),
  };
}

export { daysBetween };
