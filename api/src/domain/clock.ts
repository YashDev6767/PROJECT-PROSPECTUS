import type { ISODate } from "./dates.js";

/** "Today" as a calendar date in the institution's time zone (default Asia/Kolkata), not the server's UTC date. */
export function todayInZone(now: Date, timeZone: string): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function today(now = new Date(), timeZone = "Asia/Kolkata"): ISODate {
  return todayInZone(now, timeZone);
}

/** Wall-clock "HH:MM" in the same zone. */
export function timeInZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}
