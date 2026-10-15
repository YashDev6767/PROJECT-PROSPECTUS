import type { PrismaClient } from "@prisma/client";
import { rangesOverlap } from "../domain/dates.js";
import { findConflicts, type Conflict, type SlotRow } from "../domain/timetable.js";
import { iso } from "./format.js";

const entryInclude = { subject: { include: { batch: { include: { semester: true } }, faculty: true } } } as const;

type EntryWithSubject = Awaited<ReturnType<typeof loadEntries>>[number];
const loadEntries = (prisma: PrismaClient, where: object) => prisma.timetableEntry.findMany({ where, include: entryInclude });

export const toSlotRow = (e: EntryWithSubject): SlotRow => ({
  id: e.id, weekday: e.weekday, startTime: e.startTime, endTime: e.endTime,
  batchId: e.subject.batchId, batchName: e.subject.batch.name,
  facultyId: e.subject.facultyId, facultyName: e.subject.faculty?.name ?? null, subjectName: e.subject.name,
});

export interface SlotContext { batchId: string; facultyId: string | null; subjectName: string; batchName: string; facultyName: string | null; semesterStart: Date; semesterEnd: Date }

/** Existing rows that could clash: the same batch, or the same faculty in a semester that overlaps in time. */
async function conflictPool(prisma: PrismaClient, ctx: SlotContext): Promise<SlotRow[]> {
  const rows = await loadEntries(prisma, {
    subject: { OR: [{ batchId: ctx.batchId }, ...(ctx.facultyId ? [{ facultyId: ctx.facultyId }] : [])] },
  });
  return rows
    .filter((r) => r.subject.batchId === ctx.batchId || rangesOverlap(iso(r.subject.batch.semester.startsOn), iso(r.subject.batch.semester.endsOn), iso(ctx.semesterStart), iso(ctx.semesterEnd)))
    .map(toSlotRow);
}

export async function checkSlotConflicts(
  prisma: PrismaClient, ctx: SlotContext, slot: { id?: string; weekday: number; startTime: string; endTime: string },
): Promise<Conflict[]> {
  const pool = await conflictPool(prisma, ctx);
  return findConflicts({ ...slot, batchId: ctx.batchId, batchName: ctx.batchName, facultyId: ctx.facultyId, facultyName: ctx.facultyName, subjectName: ctx.subjectName }, pool);
}

export const slotContextFor = (s: { name: string; batchId: string; facultyId: string | null; batch: { name: string; semester: { startsOn: Date; endsOn: Date } }; faculty: { name: string } | null }): SlotContext => ({
  batchId: s.batchId, facultyId: s.facultyId, subjectName: s.name, batchName: s.batch.name, facultyName: s.faculty?.name ?? null,
  semesterStart: s.batch.semester.startsOn, semesterEnd: s.batch.semester.endsOn,
});
