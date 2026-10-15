const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export const shortDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));
export const longDate = (iso: string) => longFmt.format(new Date(`${iso}T00:00:00Z`));
export const hours = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} h`;
export const daysLabel = (n: number) => (n === 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`);

/* ---------- display-only month helpers (all working-day logic lives in the API domain layer) ---------- */
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
export const monthLabel = (month: string) => monthFmt.format(new Date(`${month}-01T00:00:00Z`));
export const addMonths = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const pad = (n: number) => String(n).padStart(2, "0");
export const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const dateRange = (a: string, b: string) => (a === b ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`);
