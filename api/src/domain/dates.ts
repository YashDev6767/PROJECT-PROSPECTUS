/** Calendar-day helpers. Dates are ISO "YYYY-MM-DD" strings interpreted in UTC, so there is no time-zone drift. */
export type ISODate = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(value: string): boolean {
  if (!ISO_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const toDate = (iso: ISODate) => new Date(`${iso}T00:00:00Z`);
export const toISO = (d: Date): ISODate => d.toISOString().slice(0, 10);
export const addDays = (iso: ISODate, n: number): ISODate => toISO(new Date(toDate(iso).getTime() + n * 86_400_000));

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(iso: ISODate): number {
  const d = toDate(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

export const weekdayNames = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** Inclusive list of days; refuses ranges over ~10 years to protect callers from runaway loops. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  if (from > to) return out;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push(d);
    if (out.length > 3660) throw new RangeError("date range too large");
  }
  return out;
}

/** Inclusive-range intersection. */
export const rangesOverlap = (aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate) => aStart <= bEnd && bStart <= aEnd;

export const monthBounds = (month: string): { from: ISODate; to: ISODate } => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
};

/** Whole days from `a` to `b` (negative when b is earlier). */
export const daysBetweenISO = (a: ISODate, b: ISODate) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
