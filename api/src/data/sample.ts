/**
 * SAMPLE (demonstration) academic-setup data. Every row is flagged `isSample: true` when seeded, and the UI labels it.
 * Names, codes, faculty and syllabus topics are generic placeholders — NOT real MSOT courses, people or syllabi.
 * Ids are deterministic so `npm run db:seed` can be re-run safely (duplicates are skipped).
 */
import type { CampusId } from "./campuses.js";
import { campuses } from "./campuses.js";
import type { SaturdayRule } from "../domain/calendar.js";
import type { ExamType } from "../domain/exams.js";
import { findConflicts, type SlotRow } from "../domain/timetable.js";
import { occurrencesBetween, teachingDay, type TeachingContext } from "../domain/schedule.js";
import type { CalendarEntryLike } from "../domain/calendar.js";
import { addDays } from "../domain/dates.js";

type Track = "MIRAI" | "UNIVERSITY";
export interface SampleSemester { id: string; name: string; academicYear: string; track: Track; campusId: CampusId; startsOn: string; endsOn: string; saturdayRule: SaturdayRule; isActive: boolean }
export interface SampleBatch { id: string; name: string; semesterId: string; studentCount: number }
export interface SampleFaculty { id: string; name: string; campusId: CampusId }
export interface SampleSubject { id: string; code: string; name: string; batchId: string; facultyId: string | null; plannedHours: number }
export interface SampleSlot { id: string; subjectId: string; weekday: number; startTime: string; endTime: string; room: string }
export interface SampleUnit { id: string; subjectId: string; title: string; position: number }
export interface SampleTopic { id: string; unitId: string; title: string; position: number; plannedHours: number; examScope: ExamType }
export interface SampleCalendarEntry { id: string; title: string; category: "HOLIDAY" | "EVENT" | "ACADEMIC_DEADLINE" | "SPECIAL_WORKING_DAY"; startsOn: string; endsOn: string; campusId: CampusId | null; description: string | null }
export interface SampleSessionLog {
  id: string; subjectId: string; timetableEntryId: string; makeupOfId: string | null; mergedIntoId: string | null; heldOn: string;
  slotStart: string; slotEnd: string; scheduledHours: number; outcome: "COMPLETED" | "IN_PROGRESS" | "MERGED" | "CANCELLED";
  rescheduledTo: string | null; carryForward: string | null; classworkStatus: "NOT_GIVEN" | "GIVEN" | "REVIEWED"; homeworkStatus: "NOT_GIVEN" | "GIVEN" | "REVIEWED";
  notes: string | null; loggedByFacultyId: string | null;
}
export interface SampleTopicEntry { id: string; sessionLogId: string; topicId: string; kind: "COVERED"; completionPct: number }
export interface SampleExam { id: string; name: string; type: ExamType; semesterId: string; batchId: string | null; startsOn: string; endsOn: string; notes: string | null }

const saturdayRuleByCampus: Record<CampusId, SaturdayRule> = { "hi-tech": "SECOND_FOURTH", ratnam: "ALL", rgib: "NONE", juj: "SECOND_FOURTH" };
const batchLetters: Record<CampusId, Record<Track, string[]>> = {
  "hi-tech": { MIRAI: ["A", "B"], UNIVERSITY: ["A", "B"] },
  ratnam: { MIRAI: ["A"], UNIVERSITY: ["A"] },
  rgib: { MIRAI: ["A"], UNIVERSITY: ["A"] },
  juj: { MIRAI: ["A"], UNIVERSITY: ["A"] },
};
const subjectPool = ["Programming Fundamentals", "Discrete Mathematics", "Database Concepts", "Professional Communication"];
const facultyPerCampus: Record<CampusId, number> = { "hi-tech": 4, ratnam: 2, rgib: 2, juj: 2 };
const examScopes: ExamType[] = ["SESSIONAL", "MID_TERM", "PUT", "END_TERM"];
const grid = [["09:00", "10:00"], ["10:15", "11:15"], ["11:30", "12:30"], ["13:30", "14:30"], ["14:45", "15:45"]] as const;
const SESSIONS_PER_WEEK = 3;
const PLANNED_HOURS = 36;

export function buildSampleData() {
  const semesters: SampleSemester[] = [], batches: SampleBatch[] = [], faculty: SampleFaculty[] = [], subjects: SampleSubject[] = [];
  const timetable: SampleSlot[] = [], units: SampleUnit[] = [], topics: SampleTopic[] = [];

  for (const campus of campuses) {
    const abbr = campus.id.toUpperCase().replace("-", "");
    for (let n = 1; n <= facultyPerCampus[campus.id]; n++) faculty.push({ id: `sample-fac-${campus.id}-${n}`, name: `Sample Faculty ${abbr}-${n}`, campusId: campus.id });
    const campusSlots: SlotRow[] = []; // for conflict-free greedy scheduling across both tracks of this campus
    let batchCounter = 0, subjectCounter = 0;

    for (const track of ["MIRAI", "UNIVERSITY"] as const) {
      const sem: SampleSemester = {
        id: `sample-sem-${campus.id}-${track.toLowerCase()}-3`, name: "Semester 3", academicYear: "2026-27", track, campusId: campus.id,
        startsOn: "2026-08-03", endsOn: "2026-12-18", saturdayRule: saturdayRuleByCampus[campus.id], isActive: true,
      };
      semesters.push(sem);

      for (const letter of batchLetters[campus.id][track]) {
        const trackName = track === "MIRAI" ? "Mirai" : "University";
        const batch: SampleBatch = { id: `sample-batch-${campus.id}-${track.toLowerCase()}-${letter.toLowerCase()}-s3`, name: `${trackName} Batch ${letter}`, semesterId: sem.id, studentCount: 38 + batchCounter * 4 };
        batches.push(batch);

        subjectPool.forEach((name, k) => {
          const code = `SMP${track === "MIRAI" ? 1 : 2}0${k + 1}`;
          const fac = faculty.filter((f) => f.campusId === campus.id)[subjectCounter % facultyPerCampus[campus.id]]!;
          // One subject is deliberately left without faculty so the "unassigned" state is visible in the UI.
          const unassigned = campus.id === "hi-tech" && track === "UNIVERSITY" && letter === "B" && k === 3;
          const subject: SampleSubject = { id: `sample-subj-${batch.id}-${code.toLowerCase()}`, code, name, batchId: batch.id, facultyId: unassigned ? null : fac.id, plannedHours: PLANNED_HOURS };
          subjects.push(subject);
          subjectCounter++;

          const days = new Set<number>();
          for (let s = 0; s < SESSIONS_PER_WEEK; s++) {
            const start = (k * 3 + s * 7 + batchCounter * 2) % (grid.length * 5);
            let placed = false;
            for (let i = 0; i < grid.length * 5 && !placed; i++) {
              const pos = (start + i) % (grid.length * 5);
              const weekday = (pos % 5) + 1, [startTime, endTime] = grid[Math.floor(pos / 5)]!;
              if (days.has(weekday)) continue;
              const row: SlotRow = { weekday, startTime, endTime, batchId: batch.id, batchName: batch.name, facultyId: subject.facultyId, facultyName: fac.name, subjectName: name };
              if (findConflicts(row, campusSlots).length) continue;
              campusSlots.push(row);
              days.add(weekday);
              timetable.push({ id: `sample-tt-${subject.id}-${s + 1}`, subjectId: subject.id, weekday, startTime, endTime, room: `${abbr}-${100 + batchCounter * 10 + k}` });
              placed = true;
            }
            if (!placed) throw new Error(`Sample timetable: no free slot for ${subject.id}`);
          }

          examScopes.forEach((scope, u) => {
            const unit: SampleUnit = { id: `${subject.id}-u${u + 1}`, subjectId: subject.id, title: `Sample Unit ${u + 1}`, position: u };
            units.push(unit);
            for (let t = 0; t < 3; t++) topics.push({ id: `${unit.id}-t${t + 1}`, unitId: unit.id, title: `Sample Topic ${u + 1}.${t + 1}`, position: t, plannedHours: 3, examScope: scope });
          });
        });
        batchCounter++;
      }
    }
  }

  // HI-Tech Mirai also gets a completed and an upcoming semester so every status badge appears.
  for (const [key, name, year, startsOn, endsOn] of [["2", "Semester 2", "2025-26", "2026-01-05", "2026-05-29"], ["4", "Semester 4", "2026-27", "2027-01-04", "2027-05-28"]] as const) {
    const sem: SampleSemester = { id: `sample-sem-hi-tech-mirai-${key}`, name, academicYear: year, track: "MIRAI", campusId: "hi-tech", startsOn, endsOn, saturdayRule: "SECOND_FOURTH", isActive: false };
    semesters.push(sem);
    const batch: SampleBatch = { id: `sample-batch-hi-tech-mirai-a-s${key}`, name: "Mirai Batch A", semesterId: sem.id, studentCount: 40 };
    batches.push(batch);
    subjectPool.slice(0, 2).forEach((name2, k) => {
      const subject: SampleSubject = { id: `sample-subj-${batch.id}-smp10${k + 1}`, code: `SMP10${k + 1}`, name: name2, batchId: batch.id, facultyId: null, plannedHours: PLANNED_HOURS };
      subjects.push(subject);
      if (key !== "2") return; // the completed semester also gets a timetable and syllabus so its progress is measurable
      [1, 3, 5].forEach((weekday, n) => timetable.push({ id: `sample-tt-${subject.id}-${n + 1}`, subjectId: subject.id, weekday, startTime: k === 0 ? "09:00" : "10:15", endTime: k === 0 ? "10:00" : "11:15", room: `S2-${k + 1}` }));
      examScopes.forEach((scope, u) => {
        const unit: SampleUnit = { id: `${subject.id}-u${u + 1}`, subjectId: subject.id, title: `Sample Unit ${u + 1}`, position: u };
        units.push(unit);
        for (let t = 0; t < 3; t++) topics.push({ id: `${unit.id}-t${t + 1}`, unitId: unit.id, title: `Sample Topic ${u + 1}.${t + 1}`, position: t, plannedHours: 3, examScope: scope });
      });
    });
  }

  const calendar: SampleCalendarEntry[] = [
    { id: "sample-cal-1", title: "Gandhi Jayanti", category: "HOLIDAY", startsOn: "2026-10-02", endsOn: "2026-10-02", campusId: null, description: "Institution-wide holiday (sample)" },
    { id: "sample-cal-2", title: "Diwali break", category: "HOLIDAY", startsOn: "2026-11-07", endsOn: "2026-11-11", campusId: null, description: "Multi-day holiday range (sample dates)" },
    { id: "sample-cal-3", title: "Christmas", category: "HOLIDAY", startsOn: "2026-12-25", endsOn: "2026-12-25", campusId: null, description: null },
    { id: "sample-cal-4", title: "Hackathon day", category: "EVENT", startsOn: "2026-10-24", endsOn: "2026-10-24", campusId: "hi-tech", description: "HI-Tech campus event (sample)" },
    { id: "sample-cal-5", title: "Campus fest", category: "EVENT", startsOn: "2026-10-29", endsOn: "2026-10-30", campusId: "rgib", description: "RGIB campus event (sample)" },
    { id: "sample-cal-6", title: "Industry visit week", category: "EVENT", startsOn: "2026-11-16", endsOn: "2026-11-20", campusId: "ratnam", description: "Ratnam campus event (sample)" },
    { id: "sample-cal-7", title: "Guest lecture series", category: "EVENT", startsOn: "2026-10-20", endsOn: "2026-10-21", campusId: "juj", description: "JUJ campus event (sample)" },
    { id: "sample-cal-8", title: "Make-up working Saturday", category: "SPECIAL_WORKING_DAY", startsOn: "2026-10-31", endsOn: "2026-10-31", campusId: "hi-tech", description: "5th Saturday normally off; classes run to recover Gandhi Jayanti (sample)" },
    { id: "sample-cal-9", title: "Assignment marks deadline", category: "ACADEMIC_DEADLINE", startsOn: "2026-11-27", endsOn: "2026-11-27", campusId: null, description: null },
    { id: "sample-cal-10", title: "Timetable freeze", category: "ACADEMIC_DEADLINE", startsOn: "2026-08-14", endsOn: "2026-08-14", campusId: null, description: null },
  ];

  const exams: SampleExam[] = [];
  for (const sem of semesters.filter((s) => s.name === "Semester 3")) {
    const base = `sample-exam-${sem.campusId}-${sem.track.toLowerCase()}`;
    exams.push(
      { id: `${base}-sessional1`, name: "Sessional 1", type: "SESSIONAL", semesterId: sem.id, batchId: null, startsOn: "2026-09-14", endsOn: "2026-09-18", notes: null },
      { id: `${base}-midterm`, name: "Mid-term", type: "MID_TERM", semesterId: sem.id, batchId: null, startsOn: "2026-10-26", endsOn: "2026-10-30", notes: "Units 1–3 (sample note)" },
      { id: `${base}-put`, name: "Pre-University Test", type: "PUT", semesterId: sem.id, batchId: null, startsOn: "2026-11-30", endsOn: "2026-12-04", notes: null },
      { id: `${base}-endterm`, name: "End-term", type: "END_TERM", semesterId: sem.id, batchId: null, startsOn: "2026-12-07", endsOn: "2026-12-17", notes: null },
    );
  }
  exams.push({ id: "sample-exam-hi-tech-mirai-sessional2-a", name: "Sessional 2 (Batch A)", type: "SESSIONAL", semesterId: "sample-sem-hi-tech-mirai-3", batchId: "sample-batch-hi-tech-mirai-a-s3", startsOn: "2026-11-16", endsOn: "2026-11-18", notes: "Batch-scoped example" });

  const { sessionLogs, topicEntries } = buildSampleLogs({ semesters, batches, subjects, timetable, units, topics, calendar, exams });
  return { semesters, batches, faculty, subjects, timetable, units, topics, calendar, exams, sessionLogs, topicEntries };
}


/* ---------- sample session logs ---------- */
export const SAMPLE_LOG_CUTOFF = "2026-10-15"; // sample classes were logged up to here; later dates are genuinely un-logged

interface Profile { rate: number; cancelEvery: number; unloggedEvery: number }
// hours of syllabus covered per hour taught, and how often a class is cancelled / forgotten. Calibrated in sample.test.ts so the
// sample shows every status (ON TRACK, TIGHT, DANGER, COMPLETE), not "everything critical".
const profiles: Profile[] = [
  { rate: 1.3, cancelEvery: 9, unloggedEvery: 0 }, // comfortably ahead
  { rate: 0.93, cancelEvery: 7, unloggedEvery: 0 }, // close to plan
  { rate: 0.8, cancelEvery: 5, unloggedEvery: 6 }, // behind
  { rate: 1.2, cancelEvery: 0, unloggedEvery: 11 },
];

function buildSampleLogs(d: { semesters: SampleSemester[]; batches: SampleBatch[]; subjects: SampleSubject[]; timetable: SampleSlot[]; units: SampleUnit[]; topics: SampleTopic[]; calendar: SampleCalendarEntry[]; exams: SampleExam[] }) {
  const sessionLogs: SampleSessionLog[] = [], topicEntries: SampleTopicEntry[] = [];
  const logsByKey = new Map<string, SampleSessionLog>();

  d.subjects.forEach((subject, idx) => {
    const batch = d.batches.find((b) => b.id === subject.batchId)!;
    const sem = d.semesters.find((s) => s.id === batch.semesterId)!;
    const slots = d.timetable.filter((t) => t.subjectId === subject.id);
    if (slots.length === 0) return;
    const completed = sem.endsOn < SAMPLE_LOG_CUTOFF;
    const cutoff = completed ? sem.endsOn : SAMPLE_LOG_CUTOFF;
    const calendar: CalendarEntryLike[] = d.calendar.filter((c) => c.campusId === null || c.campusId === sem.campusId).map((c) => ({ ...c }));
    const examPeriods = d.exams.filter((e) => e.semesterId === sem.id && (e.batchId === null || e.batchId === batch.id)).map((e) => ({ startsOn: e.startsOn, endsOn: e.endsOn }));
    const tctx: TeachingContext = { rule: sem.saturdayRule, calendar, examPeriods };
    const occ = occurrencesBetween(slots, sem.startsOn, cutoff, tctx);

    const subjectTopics = d.units.filter((u) => u.subjectId === subject.id).sort((a, b) => a.position - b.position)
      .flatMap((u) => d.topics.filter((t) => t.unitId === u.id).sort((a, b) => a.position - b.position));
    const profile = completed ? { rate: 1.1, cancelEvery: 12, unloggedEvery: 0 } : profiles[(idx + d.batches.indexOf(batch)) % profiles.length]!;
    let covered = 0; // syllabus hours covered so far
    const total = subjectTopics.reduce((n, t) => n + t.plannedHours, 0);
    let seq = 0;
    const factFaculty = subject.facultyId;

    for (const [i, o] of occ.entries()) {
      if (covered >= total - 1e-9) break;
      if (profile.unloggedEvery && (i + 1) % profile.unloggedEvery === 0) continue; // forgotten to log
      const logId = `sample-log-${subject.id}-${o.date}`;
      const base = { id: logId, subjectId: subject.id, timetableEntryId: o.entryId!, makeupOfId: null, mergedIntoId: null, heldOn: o.date, slotStart: o.startTime, slotEnd: o.endTime, scheduledHours: o.hours, rescheduledTo: null, carryForward: null, classworkStatus: "NOT_GIVEN" as const, homeworkStatus: "NOT_GIVEN" as const, notes: null, loggedByFacultyId: factFaculty };
      if (profile.cancelEvery && (i + 1) % profile.cancelEvery === 0) {
        sessionLogs.push({ ...base, outcome: "CANCELLED", notes: "Sample: class cancelled" });
        logsByKey.set(`${subject.id}|${o.date}`, sessionLogs.at(-1)!);
        continue;
      }
      const start = covered, target = Math.min(total, covered + profile.rate * o.hours);
      let acc = 0, partial = false;
      for (const t of subjectTopics) {
        const tStart = acc, tEnd = acc + t.plannedHours;
        acc = tEnd;
        if (tEnd <= start + 1e-9 || tStart >= target - 1e-9) continue;
        const pct = Math.round((Math.min(target, tEnd) - tStart) / t.plannedHours * 100);
        if (pct < 1) continue;
        if (pct < 100) partial = true;
        topicEntries.push({ id: `${logId}-${t.id}`, sessionLogId: logId, topicId: t.id, kind: "COVERED", completionPct: pct });
      }
      covered = target;
      seq++;
      sessionLogs.push({ ...base, outcome: partial ? "IN_PROGRESS" : "COMPLETED", carryForward: partial ? "Sample: finish the worked examples next class" : null, homeworkStatus: seq % 3 === 0 ? "GIVEN" : "NOT_GIVEN", classworkStatus: seq % 2 === 0 ? "REVIEWED" : "NOT_GIVEN" });
      logsByKey.set(`${subject.id}|${o.date}`, sessionLogs.at(-1)!);
    }
  });

  // One cancelled class is rescheduled to the next teaching day, so the plan shows a replacement session.
  const cancelled = sessionLogs.find((l) => l.outcome === "CANCELLED" && l.subjectId.includes("hi-tech-mirai-a-s3") && l.heldOn >= "2026-10-01");
  if (cancelled) {
    const sub = d.subjects.find((s) => s.id === cancelled.subjectId)!;
    const sem = d.semesters.find((s) => s.id === d.batches.find((b) => b.id === sub.batchId)!.semesterId)!;
    const tctx: TeachingContext = { rule: sem.saturdayRule, calendar: d.calendar.filter((c) => c.campusId === null || c.campusId === sem.campusId).map((c) => ({ ...c })), examPeriods: d.exams.filter((e) => e.semesterId === sem.id).map((e) => ({ startsOn: e.startsOn, endsOn: e.endsOn })) };
    for (let day = addDays(SAMPLE_LOG_CUTOFF, 1), n = 0; n < 14; day = addDays(day, 1), n++) {
      if (teachingDay(day, tctx).teaching) { cancelled.rescheduledTo = day; cancelled.notes = "Sample: class cancelled, rescheduled to the next free day"; break; }
    }
  }

  // One merged class: Batch B joined Batch A's session of the same subject and faculty on the same day.
  for (const a of sessionLogs) {
    if (a.outcome === "CANCELLED" || !a.subjectId.includes("hi-tech-mirai-a-s3")) continue;
    const bSubject = a.subjectId.replace("mirai-a-s3", "mirai-b-s3");
    const b = logsByKey.get(`${bSubject}|${a.heldOn}`);
    if (b && (b.outcome === "COMPLETED" || b.outcome === "IN_PROGRESS")) { b.outcome = "MERGED"; b.mergedIntoId = a.id; b.notes = "Sample: joined Batch A's session"; break; }
  }
  return { sessionLogs, topicEntries };
}

