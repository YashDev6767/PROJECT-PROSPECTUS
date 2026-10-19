// Pure helpers for the weekly time grid. Everything is derived from saved start/end times and ISO dates (UTC maths, so the
// result never depends on the browser's timezone or DST).

export const toMinutes = (hhmm: string): number => { const [h = "0", m = "0"] = hhmm.split(":"); return Number(h) * 60 + Number(m); };
export const timeLabel = (hhmm: string): string => { const [h = "0", m = "00"] = hhmm.split(":"); return `${String(Number(h)).padStart(2, "0")}:${m.padStart(2, "0")}`; };

const parse = (iso: string) => { const [y, m, d] = iso.split("-").map(Number) as [number, number, number]; return Date.UTC(y, m - 1, d); };
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => fmt(parse(iso) + n * 86_400_000);
/** ISO weekday of a date: 1 = Monday … 7 = Sunday (matches the API's `weekday`). */
export const isoWeekday = (iso: string) => { const d = new Date(parse(iso)).getUTCDay(); return d === 0 ? 7 : d; };
export const weekStart = (iso: string) => addDays(iso, 1 - isoWeekday(iso));
export const weekDates = (anchor: string, days: number): string[] => { const s = weekStart(anchor); return Array.from({ length: days }, (_, i) => addDays(s, i)); };
export const monthsOf = (dates: string[]): string[] => [...new Set(dates.map((d) => d.slice(0, 7)))];

export interface Timed { startTime: string; endTime: string }
export interface Placed<T extends Timed> { item: T; lane: number; lanes: number; startMin: number; endMin: number }

/** Greedy lane assignment per overlap cluster: overlapping sessions sit side by side instead of hiding each other. */
export function layoutDay<T extends Timed>(items: T[]): Array<Placed<T>> {
  const sorted = items.map((item) => ({ item, startMin: toMinutes(item.startTime), endMin: Math.max(toMinutes(item.endTime), toMinutes(item.startTime) + 1) }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out: Array<Placed<T>> = [];
  let cluster: Array<Placed<T>> = [];
  let clusterEnd = -1;
  const flush = () => { const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1)); for (const c of cluster) { c.lanes = lanes; out.push(c); } cluster = []; };
  for (const s of sorted) {
    if (cluster.length && s.startMin >= clusterEnd) { flush(); clusterEnd = -1; }
    const used = new Set(cluster.filter((c) => c.endMin > s.startMin).map((c) => c.lane));
    let lane = 0; while (used.has(lane)) lane++;
    cluster.push({ ...s, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, s.endMin);
  }
  flush();
  return out;
}

/** Whole-hour window covering every session (never narrower than 08:00–16:00 so an empty-ish week still reads as a day). */
export function hourWindow(items: Timed[], minHour = 8, maxHour = 16): { from: number; to: number } {
  let from = minHour, to = maxHour;
  for (const i of items) { from = Math.min(from, Math.floor(toMinutes(i.startTime) / 60)); to = Math.max(to, Math.ceil(toMinutes(i.endTime) / 60)); }
  return { from, to };
}

const short = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const shortY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const rangeLabel = (from: string, to: string) => {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${sameYear ? short.format(parse(from)) : shortY.format(parse(from))} – ${shortY.format(parse(to))}`;
};
