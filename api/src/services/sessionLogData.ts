import type { Prisma, PrismaClient } from "@prisma/client";
import { isoWeekday, type ISODate } from "../domain/dates.js";
import { teachingDay } from "../domain/schedule.js";
import { countsForCoverage, taughtHours, validateLog, type LogContext, type LogDraft, type Outcome } from "../domain/sessionLogs.js";
import { HttpError, failOnIssues } from "../http/errors.js";
import { iso } from "./format.js";
import { loadSubjectContexts, teachingContextFor, type SubjectContext } from "./progressionData.js";

export const logInclude = {
  subject: { include: { batch: { include: { semester: true } }, faculty: true } },
  topicEntries: { include: { topic: { include: { unit: true } } } },
  loggedByFaculty: true,
} satisfies Prisma.SessionLogInclude;
export type LogRow = Prisma.SessionLogGetPayload<{ include: typeof logInclude }>;

export function serializeLog(l: LogRow) {
  const pick = (kind: "COVERED" | "LEFTOVER" | "SKIPPED") => l.topicEntries.filter((e) => e.kind === kind)
    .sort((a, b) => a.topic.unit.position - b.topic.unit.position || a.topic.position - b.topic.position)
    .map((e) => ({ topicId: e.topicId, title: e.topic.title, unitTitle: e.topic.unit.title, completionPct: e.completionPct }));
  const sem = l.subject.batch.semester;
  return {
    id: l.id, subjectId: l.subjectId, subjectCode: l.subject.code, subjectName: l.subject.name, batchId: l.subject.batchId, batchName: l.subject.batch.name,
    semesterId: sem.id, campusId: sem.campusId, track: sem.track, facultyId: l.subject.facultyId, facultyName: l.subject.faculty?.name ?? null,
    timetableEntryId: l.timetableEntryId, makeupOfId: l.makeupOfId, mergedIntoId: l.mergedIntoId,
    heldOn: iso(l.heldOn), slotStart: l.slotStart, slotEnd: l.slotEnd, scheduledHours: l.scheduledHours, actualHours: l.actualHours,
    hoursTaught: taughtHours({ outcome: l.outcome, actualHours: l.actualHours, scheduledHours: l.scheduledHours }), // derived
    outcome: l.outcome, rescheduledTo: l.rescheduledTo ? iso(l.rescheduledTo) : null,
    covered: pick("COVERED"), leftover: pick("LEFTOVER"), skipped: pick("SKIPPED"),
    carryForward: l.carryForward, classworkStatus: l.classworkStatus, homeworkStatus: l.homeworkStatus, notes: l.notes,
    revision: l.revision, reviewedAt: l.reviewedAt?.toISOString() ?? null, reviewedByRole: l.reviewedByRole, reviewNote: l.reviewNote,
    loggedByRole: l.loggedByRole, loggedByFacultyName: l.loggedByFaculty?.name ?? null, createdAt: l.createdAt.toISOString(), updatedAt: l.updatedAt.toISOString(), isSample: l.isSample,
  };
}

/** Latest recorded completion per topic from other counting logs dated on/before `upTo` (for "a session cannot lower it"). */
export function priorCompletion(sessions: SubjectContext["subject"]["sessions"], upTo: ISODate, excludeLogId: string | null) {
  const latest = new Map<string, { kind: string; pct: number; heldOn: ISODate; seq: number }>();
  for (const l of sessions) {
    if (l.id === excludeLogId || !countsForCoverage(l.outcome) || iso(l.heldOn) > upTo) continue;
    for (const e of l.topicEntries) {
      if (e.kind === "LEFTOVER") continue;
      const cur = latest.get(e.topicId), h = iso(l.heldOn), seq = l.createdAt.getTime();
      if (!cur || h > cur.heldOn || (h === cur.heldOn && seq > cur.seq)) latest.set(e.topicId, { kind: e.kind, pct: e.completionPct, heldOn: h, seq });
    }
  }
  return new Map([...latest].filter(([, v]) => v.kind === "COVERED").map(([id, v]) => [id, { pct: v.pct, heldOn: v.heldOn }]));
}

export interface DraftWithIds extends LogDraft { classworkStatus: "NOT_GIVEN" | "GIVEN" | "REVIEWED"; homeworkStatus: "NOT_GIVEN" | "GIVEN" | "REVIEWED" }

/** Validates a draft against everything the database knows, throwing a field-level 400 on any problem. */
export async function validateAgainstData(prisma: PrismaClient, ctx: SubjectContext, d: LogDraft, today: ISODate, excludeLogId: string | null) {
  const s = ctx.subject, sem = s.batch.semester;
  const tctx = teachingContextFor(ctx);
  const topicTitles = new Map(s.units.flatMap((u) => u.topics.map((t) => [t.id, t.title] as const)));

  let slot: LogContext["slot"] = null;
  let entry: (typeof s.timetable)[number] | null = null;
  if (d.timetableEntryId) {
    entry = s.timetable.find((t) => t.id === d.timetableEntryId) ?? null;
    if (!entry) throw new HttpError(400, "validation_failed", "The request has invalid fields", { issues: [{ path: "timetableEntryId", message: "That timetable slot does not belong to this subject." }] });
    const t = teachingDay(d.heldOn, tctx);
    slot = { weekdayMatches: isoWeekday(d.heldOn) === entry.weekday, teaching: t.teaching, reason: String(t.reason).replace(/_/g, " ") };
  }
  let makeupSource: Awaited<ReturnType<typeof prisma.sessionLog.findUnique>> = null;
  if (d.makeupOfId) {
    makeupSource = await prisma.sessionLog.findUnique({ where: { id: d.makeupOfId } });
    if (!makeupSource || makeupSource.subjectId !== s.id || makeupSource.outcome !== "CANCELLED" || !makeupSource.rescheduledTo || iso(makeupSource.rescheduledTo) !== d.heldOn) {
      throw new HttpError(400, "validation_failed", "The request has invalid fields", { issues: [{ path: "makeupOfId", message: "This is not a rescheduled session for this subject on this date." }] });
    }
  }
  const rescheduleTarget = d.rescheduledTo ? (() => { const t = teachingDay(d.rescheduledTo, tctx); return { teaching: t.teaching, reason: String(t.reason).replace(/_/g, " ") }; })() : null;

  let merge: LogContext["merge"] = null;
  if (d.mergedIntoId) {
    const primary = await prisma.sessionLog.findUnique({ where: { id: d.mergedIntoId }, include: { subject: { include: { batch: { include: { semester: true } } } } } });
    merge = primary && primary.subject.batch.semester.campusId === sem.campusId // a primary session on another campus is "not found"
      ? { found: true, isSelf: primary.id === excludeLogId, sameDate: iso(primary.heldOn) === d.heldOn, sameFaculty: primary.subject.facultyId !== null && primary.subject.facultyId === s.facultyId, primaryOutcome: primary.outcome as Outcome }
      : { found: false, isSelf: false, sameDate: false, sameFaculty: false, primaryOutcome: null };
  }

  const issues = validateLog(d, {
    today, semester: { startsOn: iso(sem.startsOn), endsOn: iso(sem.endsOn) }, topicTitles,
    priorPct: priorCompletion(s.sessions, d.heldOn, excludeLogId), slot, rescheduleTarget, merge,
  });
  failOnIssues(issues);
  return { entry, makeupSource };
}
