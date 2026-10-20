import type { CSSProperties } from "react";
import { cx } from "./ui";
import { shortDate } from "../lib/format";
import { hourWindow, isoWeekday, layoutDay, timeLabel } from "../lib/timetableLayout";
import { weekdayNames, weekdayShort } from "../lib/labels";
import type { CalendarDay, TimetableEntry } from "../lib/types";

/** Pixels per hour. Card top/height are computed from this and the saved start/end times — nothing is positioned by hand. */
export const HOUR_PX = 128;
const COMPACT_BELOW = 60; // px: cards shorter than this show a single line
const TIME_COL = "4.25rem";

const hueOf = (key: string) => { let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 360; return [215, 200, 185, 225, 38, 160][h % 6]!; };

export interface DayInfo { day?: CalendarDay; note?: string; outsideSemester?: boolean }

function SessionCard({ e, top, height, lane, lanes, showBatch, dim, onOpen }: { e: TimetableEntry; top: number; height: number; lane: number; lanes: number; showBatch: boolean; dim: boolean; onOpen: ((e: TimetableEntry) => void) | null }) {
  const compact = height < COMPACT_BELOW;
  const detail = [e.subjectName, `${timeLabel(e.startTime)}–${timeLabel(e.endTime)}`, e.batchName, e.facultyName ?? "No faculty assigned", e.room ? `Room ${e.room}` : null,
    e.nextDate !== undefined ? `${e.loggedCount ?? 0} logged${e.pastUnlogged ? `, ${e.pastUnlogged} not logged` : ""}` : null].filter(Boolean).join(" · ");
  const style = { top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, "--sh": hueOf(e.subjectId) } as CSSProperties;
  const cls = cx(
    "session-card absolute flex flex-col gap-0.5 overflow-hidden rounded-lg border border-line border-l-[3px] px-2.5 py-1.5 text-left transition-[box-shadow,transform] duration-150",
    dim && "opacity-55",
    onOpen && "cursor-pointer hover:-translate-y-px hover:shadow-pop focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  );
  const body = compact ? (
    <p className="truncate text-xs font-semibold leading-tight text-fg">{e.subjectName} <span className="font-medium tabular-nums text-fg-muted">· {timeLabel(e.startTime)}</span></p>
  ) : (
    <>
      <p className="line-clamp-2 shrink-0 text-sm font-semibold leading-snug text-fg break-words">{e.subjectName}</p>
      <p className="text-xs font-medium tabular-nums text-fg-2">{timeLabel(e.startTime)} – {timeLabel(e.endTime)}</p>
      {height >= 80 && <p className="truncate text-xs text-fg-muted">{showBatch ? e.batchName : e.facultyName ?? "No faculty assigned"}</p>}
      {height >= 98 && <p className="truncate text-xs text-fg-muted">{showBatch ? e.facultyName ?? "No faculty assigned" : e.batchName}{e.room ? ` · Room ${e.room}` : ""}</p>}
      {height >= 120 && e.nextDate !== undefined && (
        <p className="truncate text-xs text-fg-subtle">{e.nextDate ? `Next ${shortDate(e.nextDate)}` : "No more dates"} · {e.loggedCount ?? 0} logged{e.pastUnlogged ? <span className="font-semibold text-warn"> · {e.pastUnlogged} not logged</span> : null}</p>)}
    </>
  );
  return onOpen
    ? <button type="button" title={detail} style={style} className={cls} onClick={() => onOpen(e)} aria-label={`Edit ${detail}`}>{body}</button>
    : <div title={detail} style={style} className={cls} tabIndex={0} role="group" aria-label={detail}>{body}</div>;
}

/** Weekly (or single-day) time grid: dedicated time column, one column per date, sessions placed by start time and duration. */
export function TimetableGrid({ entries, dates, info, today, showBatch, onOpen }: { entries: TimetableEntry[]; dates: string[]; info: Record<string, DayInfo>; today: string; showBatch: boolean; onOpen: ((e: TimetableEntry) => void) | null }) {
  const { from, to } = hourWindow(entries);
  const hoursList = Array.from({ length: to - from }, (_, i) => from + i);
  const bodyH = (to - from) * HOUR_PX;
  const single = dates.length === 1;
  // A day whose sessions overlap gets a proportionally wider column so side-by-side cards stay readable.
  const laneCount = dates.map((d) => Math.min(3, Math.max(1, ...layoutDay(entries.filter((e) => e.weekday === isoWeekday(d))).map((p) => p.lanes))));
  const cols = `${TIME_COL} ${laneCount.map((n) => `minmax(${single && n === 1 ? "0" : `${11 * n}rem`}, ${n}fr)`).join(" ")}`;
  const minW = `calc(${TIME_COL} + ${laneCount.reduce((a, n) => a + 11 * n, 0)}rem)`;
  return (
    <div className="surface backdrop-blur-md overflow-x-auto overscroll-x-contain" data-testid="timetable-scroll">
      <div style={{ gridTemplateColumns: cols, minWidth: single && laneCount[0] === 1 ? undefined : minW }} className="grid">
        {/* header row */}
        <div className="sticky left-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md" />
        {dates.map((d) => {
          const i = info[d]; const wd = isoWeekday(d);
          const off = i?.day ? !i.day.working : wd === 7;
          const exam = (i?.day?.examIds.length ?? 0) > 0;
          return (
            <div key={d} className={cx("border-b border-l border-line px-3 py-2.5", off && "bg-surface-2/60", d === today && "bg-accent-soft/60")}>
              <p className="flex items-baseline gap-1.5"><span className="text-sm font-semibold text-fg">{single ? weekdayNames[wd] : weekdayShort[wd]}</span>
                <span className={cx("tabular-nums text-sm", d === today ? "font-semibold text-accent-text" : "text-fg-muted")}>{Number(d.slice(8))} {new Date(`${d}T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}</span></p>
              <p className="mt-0.5 flex min-h-5 flex-wrap items-center gap-1 text-xs">
                {d === today && <span className="rounded-full bg-accent-solid px-1.5 py-px font-semibold text-on-accent">Today</span>}
                {i?.note && <span className={cx("truncate rounded-full px-1.5 py-px font-medium", i.day?.reason === "holiday" ? "bg-danger-soft text-danger" : "bg-surface-3 text-fg-muted")}>{i.note}</span>}
                {exam && <span className="rounded-full bg-warn-soft px-1.5 py-px font-medium text-warn">Exam period</span>}
                {i?.outsideSemester && <span className="rounded-full bg-surface-3 px-1.5 py-px font-medium text-fg-muted">Outside semester</span>}
              </p>
            </div>);
        })}
        {/* time column */}
        <div className="sticky left-0 z-10 bg-surface/85 backdrop-blur-md" style={{ height: bodyH }} aria-hidden>
          {hoursList.map((h, k) => <span key={h} className="absolute right-2 -translate-y-1/2 text-xs tabular-nums text-fg-subtle" style={{ top: k * HOUR_PX, marginTop: k === 0 ? 8 : 0 }}>{String(h).padStart(2, "0")}:00</span>)}
        </div>
        {dates.map((d) => {
          const i = info[d];
          const off = i?.day ? !i.day.working : isoWeekday(d) === 7;
          const dim = off || !!i?.outsideSemester;
          const placed = layoutDay(entries.filter((e) => e.weekday === isoWeekday(d)));
          return (
            <div key={d} role="group" aria-label={`${weekdayNames[isoWeekday(d)]} ${d}`} className={cx("relative border-l border-line", off && "bg-surface-2/40")} style={{ height: bodyH, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--line) ${HOUR_PX - 1}px, var(--line) ${HOUR_PX}px)` }}>
              {placed.map((p) => (
                <SessionCard key={p.item.id} e={p.item} top={((p.startMin - from * 60) / 60) * HOUR_PX + 1} height={Math.max(((p.endMin - p.startMin) / 60) * HOUR_PX - 2, 18)} lane={p.lane} lanes={p.lanes} showBatch={showBatch} dim={dim} onOpen={onOpen} />))}
              {placed.length === 0 && <p className="px-3 pt-3 text-xs text-fg-subtle">No classes</p>}
            </div>);
        })}
      </div>
    </div>
  );
}

