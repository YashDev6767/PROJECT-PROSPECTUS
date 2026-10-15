import type { PrismaClient } from "@prisma/client";
import { isoWeekday, type ISODate } from "../domain/dates.js";
import { makeupKey, makeupOccurrences, occurrenceKey, occurrencesBetween, teachingDay, type NonTeachingReason } from "../domain/schedule.js";
import { iso } from "./format.js";
import { loadSubjectContexts, teachingContextFor } from "./progressionData.js";

export interface ScheduleItem {
  key: string; kind: "scheduled" | "makeup"; date: ISODate;
  subjectId: string; subjectCode: string; subjectName: string; batchId: string; batchName: string;
  semesterId: string; campusId: string; track: "MIRAI" | "UNIVERSITY"; facultyId: string | null; facultyName: string | null;
  entryId: string | null; makeupOfLogId: string | null; startTime: string; endTime: string; hours: number; room: string | null;
  log: null | { id: string; outcome: string; revision: number; reviewed: boolean };
}
export interface DayNotice { date: ISODate; campusId: string; semesterName: string; reason: NonTeachingReason }

export interface ScheduleFilter { from: ISODate; to: ISODate; campusId: string; track?: "MIRAI" | "UNIVERSITY" | undefined; facultyId?: string | undefined; batchId?: string | undefined; subjectId?: string | undefined }

/** Planned classes (derived from timetable + calendar + exams) merged with whatever has already been logged. */
export async function sessionsInRange(prisma: PrismaClient, f: ScheduleFilter): Promise<{ items: ScheduleItem[]; notices: DayNotice[] }> {
  const contexts = await loadSubjectContexts(prisma, {
    id: f.subjectId, facultyId: f.facultyId, batchId: f.batchId,
    batch: { semester: { campusId: f.campusId, track: f.track, startsOn: { lte: new Date(`${f.to}T00:00:00Z`) }, endsOn: { gte: new Date(`${f.from}T00:00:00Z`) } } },
  });
  const items: ScheduleItem[] = [];
  const notices = new Map<string, DayNotice>();

  for (const ctx of contexts) {
    const s = ctx.subject, sem = s.batch.semester;
    const from = f.from > iso(sem.startsOn) ? f.from : iso(sem.startsOn);
    const to = f.to < iso(sem.endsOn) ? f.to : iso(sem.endsOn);
    const tctx = teachingContextFor(ctx);
    const base = {
      subjectId: s.id, subjectCode: s.code, subjectName: s.name, batchId: s.batchId, batchName: s.batch.name,
      semesterId: sem.id, campusId: sem.campusId, track: sem.track, facultyId: s.facultyId, facultyName: s.faculty?.name ?? null,
    };
    const logOf = (l: (typeof s.sessions)[number] | undefined) => (l ? { id: l.id, outcome: l.outcome, revision: l.revision, reviewed: l.reviewedAt !== null } : null);
    const slots = s.timetable.map((t) => ({ id: t.id, weekday: t.weekday, startTime: t.startTime, endTime: t.endTime }));

    for (const o of occurrencesBetween(slots, from, to, tctx)) {
      items.push({ ...base, key: o.key, kind: "scheduled", date: o.date, entryId: o.entryId, makeupOfLogId: null, startTime: o.startTime, endTime: o.endTime, hours: o.hours,
        room: s.timetable.find((t) => t.id === o.entryId)?.room ?? null,
        log: logOf(s.sessions.find((l) => l.timetableEntryId === o.entryId && iso(l.heldOn) === o.date)) });
    }
    const rescheduled = s.sessions.filter((l) => l.outcome === "CANCELLED" && l.rescheduledTo)
      .map((l) => ({ logId: l.id, rescheduledTo: iso(l.rescheduledTo!), startTime: l.slotStart, endTime: l.slotEnd, hours: l.scheduledHours ?? 0 }));
    for (const o of makeupOccurrences(rescheduled, from, to)) {
      items.push({ ...base, key: o.key, kind: "makeup", date: o.date, entryId: null, makeupOfLogId: o.makeupOfLogId, startTime: o.startTime, endTime: o.endTime, hours: o.hours, room: null,
        log: logOf(s.sessions.find((l) => l.makeupOfId === o.makeupOfLogId)) });
    }
    // For a single day, explain why nothing is scheduled (holiday, Sunday, exam period...).
    if (f.from === f.to && slots.some((t) => t.weekday === isoWeekday(f.from)) && from <= f.from && f.from <= to) {
      const t = teachingDay(f.from, tctx);
      if (!t.teaching) notices.set(`${sem.id}`, { date: f.from, campusId: sem.campusId, semesterName: sem.name, reason: t.reason });
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.subjectName.localeCompare(b.subjectName));
  return { items, notices: [...notices.values()] };
}

export { makeupKey, occurrenceKey };
