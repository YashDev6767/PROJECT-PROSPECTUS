/**
 * DEMONSTRATION DATASET — fabricated for UI development, not persisted, not real MSOT data.
 * Dates are generated relative to `today` so the demo always looks current.
 */

import { campuses } from "./campuses.js";

export interface DemoCampus { id: string; name: string }
export interface DemoSubject {
  id: string; code: string; name: string; faculty: string; campusId: string;
  plannedHours: number; plannedHoursToDate: number; deliveredHours: number;
  hoursPerWeek: number; examOffsetDays: number | null;
}
export interface DemoScheduleItem {
  id: string; campusId: string; subjectId: string; start: string; end: string; room: string;
  state: "logged" | "needs_log" | "upcoming";
}
export interface DemoSessionLog {
  id: string; campusId: string; subjectId: string; faculty: string; hours: number; topics: string; dayOffset: number;
}

export const demoCampuses: DemoCampus[] = campuses.map((c) => ({ id: c.id, name: c.name }));

export const demoSemester = { id: "demo-sem", name: "Semester 3 (Demo)" };

/** Phase 1 dashboard demo: one template set, instantiated per campus with small per-campus differences. */
const template = {
  subjects: [
    { id: "ds", code: "CS201", name: "Data Structures", faculty: "A. Rao", plannedHours: 60, plannedHoursToDate: 36, deliveredHours: 38, hoursPerWeek: 5, examOffsetDays: 38 },
    { id: "db", code: "CS215", name: "Database Systems", faculty: "M. Iyer", plannedHours: 48, plannedHoursToDate: 30, deliveredHours: 21, hoursPerWeek: 3, examOffsetDays: 24 },
    { id: "os", code: "CS230", name: "Operating Systems", faculty: "S. Khan", plannedHours: 54, plannedHoursToDate: 34, deliveredHours: 28, hoursPerWeek: 6, examOffsetDays: 31 },
    { id: "ma", code: "MA210", name: "Discrete Mathematics", faculty: "P. Nair", plannedHours: 45, plannedHoursToDate: 28, deliveredHours: 14, hoursPerWeek: 3, examOffsetDays: 17 },
    { id: "cm", code: "HS120", name: "Communication Skills", faculty: "L. Dsouza", plannedHours: 30, plannedHoursToDate: 19, deliveredHours: 19, hoursPerWeek: 2, examOffsetDays: 45 },
  ],
  schedule: [
    { id: "t1", subjectId: "ds", start: "09:00", end: "10:00", room: "B-204", state: "logged" as const },
    { id: "t2", subjectId: "db", start: "10:15", end: "11:15", room: "B-110", state: "needs_log" as const },
    { id: "t3", subjectId: "ma", start: "13:00", end: "14:30", room: "A-301", state: "upcoming" as const },
    { id: "t4", subjectId: "os", start: "15:00", end: "16:00", room: "B-204", state: "upcoming" as const },
  ],
  sessions: [
    { id: "l1", subjectId: "ds", hours: 1, topics: "Balanced trees: AVL rotations", dayOffset: 0 },
    { id: "l2", subjectId: "os", hours: 1, topics: "Page replacement algorithms", dayOffset: -1 },
    { id: "l3", subjectId: "ma", hours: 1.5, topics: "Graph colouring and planarity", dayOffset: -1 },
    { id: "l4", subjectId: "db", hours: 1, topics: "Normalisation: 3NF and BCNF", dayOffset: -2 },
  ],
};
const deliveredShift: Record<string, number> = { "hi-tech": 0, ratnam: 4, rgib: -3, juj: 1 };

export const demoSubjects: DemoSubject[] = campuses.flatMap((c) =>
  template.subjects.map((s) => ({
    ...s, id: `${c.id}-${s.id}`, campusId: c.id,
    deliveredHours: Math.min(s.plannedHours, Math.max(0, s.deliveredHours + (deliveredShift[c.id] ?? 0))),
  })));
export const demoSchedule: DemoScheduleItem[] = campuses.flatMap((c) => template.schedule.map((t) => ({ ...t, id: `${c.id}-${t.id}`, campusId: c.id, subjectId: `${c.id}-${t.subjectId}` })));
export const demoSessions: DemoSessionLog[] = campuses.flatMap((c) =>
  template.sessions.map((l) => ({ ...l, id: `${c.id}-${l.id}`, campusId: c.id, subjectId: `${c.id}-${l.subjectId}`, faculty: template.subjects.find((s) => s.id === l.subjectId)!.faculty })));
