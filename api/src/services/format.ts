import { toDate, toISO, type ISODate } from "../domain/dates.js";

/** Prisma `@db.Date` <-> "YYYY-MM-DD". */
export const iso = (d: Date): ISODate => toISO(d);
export const dbDate = (s: ISODate): Date => toDate(s);
