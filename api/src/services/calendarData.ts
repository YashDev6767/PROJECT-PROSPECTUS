import type { PrismaClient } from "@prisma/client";
import type { CalendarEntryLike } from "../domain/calendar.js";
import type { ISODate } from "../domain/dates.js";
import { dbDate, iso } from "./format.js";

export const toEntryLike = (e: { id: string; title: string; category: CalendarEntryLike["category"]; startsOn: Date; endsOn: Date; campusId: string | null }): CalendarEntryLike =>
  ({ id: e.id, title: e.title, category: e.category, startsOn: iso(e.startsOn), endsOn: iso(e.endsOn), campusId: e.campusId });

/** Calendar entries visible to a campus (its own + institution-wide) that touch [from, to]. */
export async function loadCalendarEntries(prisma: PrismaClient, campusId: string, from: ISODate, to: ISODate): Promise<CalendarEntryLike[]> {
  const rows = await prisma.calendarEntry.findMany({
    where: { OR: [{ campusId: null }, { campusId }], startsOn: { lte: dbDate(to) }, endsOn: { gte: dbDate(from) } },
    orderBy: [{ startsOn: "asc" }, { title: "asc" }],
  });
  return rows.map(toEntryLike);
}
