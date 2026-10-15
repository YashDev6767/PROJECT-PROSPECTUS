import { ChevronLeft, ChevronRight, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, EmptyState, PageHeader, SampleBadge, Tabs, cx } from "../components/ui";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Dialog } from "../components/ui/Dialog";
import { Field, Input, Select, SubmitFeedback, Textarea, useSubmit } from "../components/ui/forms";
import { Boundary, useResource } from "../components/ui/Resource";
import { useToast } from "../components/ui/Toast";
import { useApp } from "../context/AppContext";
import { api, downloadCsv } from "../lib/api";
import { addMonths, dateRange, localToday, longDate, monthLabel } from "../lib/format";
import { campusName, campusOptions, categoryLabels, examTypeLabels, outcomeLabels, ruleLabels, trackLabels, weekdayShort, type Category, type Track } from "../lib/labels";
import type { CalendarDay, CalendarEntry, DayReason, MonthData, ScheduleResponse } from "../lib/types";

const reasonText: Record<DayReason, string> = {
  weekday: "Working day", saturday_working: "Working Saturday", saturday_off: "Saturday off (per the semester's Saturday rule)",
  sunday: "Sunday — not a working day", holiday: "Holiday — not a working day", special_working_day: "Special working day — classes run",
};
const pillTone: Record<Category | "EXAM_PERIOD", string> = {
  HOLIDAY: "bg-danger-soft text-danger", EVENT: "bg-info-soft text-info", EXAM: "bg-warn-soft text-warn", EXAM_PERIOD: "bg-warn-soft text-warn",
  ACADEMIC_DEADLINE: "bg-surface-3 text-fg-2", SPECIAL_WORKING_DAY: "bg-accent-muted text-accent-soft-fg",
};
// small glyph per kind so kinds are distinguishable without colour
const dotTone: Record<Category | "EXAM_PERIOD", string> = { HOLIDAY: "bg-danger", EVENT: "bg-info", EXAM: "bg-warn", EXAM_PERIOD: "bg-warn", ACADEMIC_DEADLINE: "bg-fg-muted", SPECIAL_WORKING_DAY: "bg-accent" };
const pillGlyph: Record<Category | "EXAM_PERIOD", string> = { HOLIDAY: "●", EVENT: "◆", EXAM: "▲", EXAM_PERIOD: "▲", ACADEMIC_DEADLINE: "■", SPECIAL_WORKING_DAY: "★" };
const cellTone = (d: CalendarDay) =>
  d.reason === "holiday" ? "bg-danger-soft/70" : d.reason === "special_working_day" ? "bg-accent-soft/80 ring-1 ring-inset ring-accent/40" : d.working ? "bg-surface/75" : "bg-surface-2/50 text-fg-subtle";
const categoryOrder: Category[] = ["SPECIAL_WORKING_DAY", "HOLIDAY", "EXAM", "ACADEMIC_DEADLINE", "EVENT"];

function Legend() {
  const chip = (cls: string, label: string, glyph?: string) => <li key={label} className="flex items-center gap-1.5"><span aria-hidden className={cx("grid size-4 place-items-center rounded-[5px] border border-line-strong text-[8px] leading-none", cls)}>{glyph}</span>{label}</li>;
  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-muted">
      {chip("bg-surface", "Working day")}{chip("bg-surface-2", "Weekend / off")}{chip("bg-danger-soft text-danger", "Holiday", "●")}{chip("bg-info-soft text-info", "Event", "◆")}
      {chip("bg-warn-soft text-warn", "Exam period", "▲")}{chip("bg-surface-3 text-fg-2", "Deadline", "■")}{chip("bg-accent-muted text-accent-soft-fg", "Special working day", "★")}
    </ul>
  );
}

interface DraftEntry { title: string; category: Category; startsOn: string; endsOn: string; campusId: string; description: string }

function EntryDialog({ entry, defaultDate, defaultCampus, onClose, onSaved }: { entry: CalendarEntry | null; defaultDate: string; defaultCampus: string; onClose: () => void; onSaved: () => void }) {
  const { can } = useApp();
  const [v, setV] = useState<DraftEntry>(entry
    ? { title: entry.title, category: entry.category, startsOn: entry.startsOn, endsOn: entry.endsOn, campusId: entry.campusId ?? "", description: entry.description ?? "" }
    : { title: "", category: "HOLIDAY", startsOn: defaultDate, endsOn: "", campusId: defaultCampus, description: "" });
  const s = useSubmit();
  const set = <K extends keyof DraftEntry>(k: K, val: DraftEntry[K]) => setV((p) => ({ ...p, [k]: val }));
  const body = { title: v.title, category: v.category, startsOn: v.startsOn, endsOn: v.endsOn || v.startsOn, campusId: v.campusId || null, description: v.description || null };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await s.run(() => (entry ? api.patch(`/api/calendar/entries/${entry.id}`, body) : api.post("/api/calendar/entries", body)))) onSaved();
  };
  const err = s.fieldErrors;
  return (
    <Dialog title={entry ? "Edit calendar entry" : "Add calendar entry"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field required label="Title" error={err.title}><Input data-autofocus value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={120} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" error={err.category}>
            <Select value={v.category} onChange={(e) => set("category", e.target.value as Category)}>
              {(Object.keys(categoryLabels) as Category[]).map((c) => <option key={c} value={c} disabled={c === "SPECIAL_WORKING_DAY" && !can("special_working_day:write")}>{categoryLabels[c]}</option>)}
            </Select>
          </Field>
          <Field label="Applies to" error={err.campusId}>
            <Select value={v.campusId} onChange={(e) => set("campusId", e.target.value)}>
              <option value="">All campuses (institution-wide)</option>
              {campusOptions.map((c) => <option key={c.id} value={c.id}>{c.name} only</option>)}
            </Select>
          </Field>
          <Field required label="Start date" error={err.startsOn}><Input type="date" value={v.startsOn} onChange={(e) => set("startsOn", e.target.value)} /></Field>
          <Field label="End date (optional)" error={err.endsOn} hint="Leave empty for a single day"><Input type="date" value={v.endsOn} min={v.startsOn} onChange={(e) => set("endsOn", e.target.value)} /></Field>
        </div>
        {v.category === "SPECIAL_WORKING_DAY" && <p className="rounded-xl bg-accent-soft p-3 text-sm text-accent-text">A special working day overrides holidays, Sundays and off Saturdays. Only authorised roles may add one.</p>}
        <Field label="Description (optional)" error={err.description}><Textarea value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={500} /></Field>
        <SubmitFeedback state={s} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={s.busy}>{s.busy ? "Saving…" : entry ? "Save changes" : "Add entry"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function TeachingSessions({ date, campusId, track }: { date: string; campusId: string; track: Track }) {
  const res = useResource<ScheduleResponse>(`/api/session-logs/schedule?date=${date}&campusId=${campusId}&track=${track}`);
  if (res.data === undefined) return res.error ? <p className="text-sm text-fg-subtle">Class schedule unavailable.</p> : <p className="text-sm text-fg-subtle">Loading classes…</p>;
  const { items, notices } = res.data;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-fg">Classes planned ({items.length})</h3><Link className="text-xs font-semibold text-accent-text underline" to={`/session-logs?date=${date}`}>Open in Session Logs</Link></div>
      {items.length === 0 ? <p className="text-sm text-fg-subtle">{notices[0] ? `No regular classes: ${notices[0].reason === "exam_period" ? "this is inside an exam period." : notices[0].reason.replace(/_/g, " ") + "."}` : "No classes in the timetable for this day."}</p> : (
        <ul className="space-y-1.5">{items.map((i) => (
          <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span><span className="tabular-nums text-fg-subtle">{i.startTime}–{i.endTime}</span> <span className="font-semibold text-fg">{i.subjectName}</span> <span className="text-fg-subtle">· {i.batchName}</span></span>
            {i.log ? <Badge tone={i.log.outcome === "CANCELLED" ? "danger" : "good"}>{outcomeLabels[i.log.outcome]}</Badge> : <Badge tone={date < res.data!.today ? "warn" : "neutral"}>{date < res.data!.today ? "Not logged" : "Planned"}</Badge>}
          </li>))}</ul>)}
    </div>
  );
}

function DayPanel({ day, data, writable, onAdd, onEdit, onDelete, campusId }: { day: CalendarDay; data: MonthData; writable: boolean; onAdd: () => void; onEdit: (e: CalendarEntry) => void; onDelete: (e: CalendarEntry) => void; campusId: string }) {
  const entries = data.entries.filter((e) => day.entryIds.includes(e.id));
  const exams = data.exams.filter((e) => day.examIds.includes(e.id));
  return (
    <Card title={longDate(day.date)} action={writable && <Button className="min-h-9 px-3" onClick={onAdd}><Plus className="size-4" aria-hidden /> Add entry</Button>}>
      <p className="mb-3"><Badge tone={day.working ? "good" : "neutral"}>{reasonText[day.reason]}</Badge></p>
      {entries.length + exams.length === 0 ? <p className="text-sm text-fg-subtle">Nothing scheduled on this day.</p> : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 rounded-xl border border-line p-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">{e.title} {e.isSample && <SampleBadge />}</p>
                <p className="text-xs text-fg-subtle">{categoryLabels[e.category]} · {dateRange(e.startsOn, e.endsOn)} · {campusName(e.campusId)}</p>
                {e.description && <p className="mt-1 text-sm text-fg-muted">{e.description}</p>}
              </div>
              {writable && <div className="flex shrink-0 gap-1">
                <Button variant="ghost" className="min-h-9 px-2" aria-label={`Edit ${e.title}`} onClick={() => onEdit(e)}><Pencil className="size-4" aria-hidden /></Button>
                <Button variant="ghost" className="min-h-9 px-2 text-danger" aria-label={`Delete ${e.title}`} onClick={() => onDelete(e)}><Trash2 className="size-4" aria-hidden /></Button>
              </div>}
            </li>))}
          {exams.map((e) => (
            <li key={e.id} className="rounded-xl border border-line p-3">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">{e.name} {e.isSample && <SampleBadge />}</p>
              <p className="text-xs text-fg-subtle">{examTypeLabels[e.type]} · {dateRange(e.startsOn, e.endsOn)}{e.batchName ? ` · ${e.batchName}` : " · whole cohort"} · <Link className="font-semibold text-accent-text underline" to="/exams">Manage on Exam Schedule</Link></p>
            </li>))}
        </ul>)}
      <TeachingSessions date={day.date} campusId={campusId} track={data.track} />
    </Card>
  );
}

function MonthGrid({ data, selected, onSelect, today }: { data: MonthData; selected: string; onSelect: (d: string) => void; today: string }) {
  const entries = useMemo(() => new Map(data.entries.map((e) => [e.id, e])), [data.entries]);
  const exams = useMemo(() => new Map(data.exams.map((e) => [e.id, e])), [data.exams]);
  const blanks = (data.days[0]?.weekday ?? 1) - 1;
  return (
    <div className="pb-1">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label={`Calendar for ${monthLabel(data.month)}`}>
        {weekdayShort.slice(1).map((w) => <div key={w} role="columnheader" className="px-1 pb-1 text-center text-xs font-semibold uppercase tracking-wide text-fg-subtle sm:px-1.5 sm:text-left"><span className="sm:hidden">{w[0]}</span><span className="hidden sm:inline">{w}</span></div>)}
        {Array.from({ length: blanks }, (_, i) => <div key={`b${i}`} role="gridcell" aria-hidden />)}
        {data.days.map((d) => {
          type Pill = { key: string; label: string; tone: string; glyph: string; dot: string; start: string; end: string };
          const es = d.entryIds.map((id) => entries.get(id)!).filter(Boolean).sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));
          const xs = d.examIds.map((id) => exams.get(id)!).filter(Boolean);
          const pills: Pill[] = [
            ...es.map((e) => ({ key: e.id, label: e.title, tone: pillTone[e.category], glyph: pillGlyph[e.category], dot: dotTone[e.category], start: e.startsOn, end: e.endsOn })),
            ...xs.map((e) => ({ key: e.id, label: e.name, tone: pillTone.EXAM_PERIOD, glyph: pillGlyph.EXAM_PERIOD, dot: dotTone.EXAM_PERIOD, start: e.startsOn, end: e.endsOn })),
          ];
          const label = `${longDate(d.date)}. ${reasonText[d.reason]}.${pills.length ? ` ${pills.map((p) => p.label).join(", ")}.` : ""}`;
          const isSelected = selected === d.date, isToday = d.date === today;
          return (
            <button key={d.date} role="gridcell" type="button" aria-label={label} aria-pressed={isSelected} aria-current={isToday ? "date" : undefined} onClick={() => onSelect(d.date)}
              className={cx("flex min-h-14 flex-col items-stretch gap-1 rounded-lg border p-1 text-left sm:min-h-24 sm:rounded-xl sm:p-1.5 transition-[border-color,box-shadow,background-color] duration-150 hover:border-accent/50",
                cellTone(d), isSelected ? "border-accent shadow-[0_0_0_2px_var(--accent)]" : "border-line")}>
              <span className={cx("grid size-6 place-items-center self-center rounded-full text-xs font-semibold tabular sm:self-start", isToday ? "bg-accent-solid text-on-accent" : "")}>{Number(d.date.slice(8))}</span>
              {pills.length > 0 && <span aria-hidden className="mt-auto flex flex-wrap justify-center gap-0.5 sm:hidden">{pills.slice(0, 4).map((p) => <span key={p.key} className={cx("size-1.5 rounded-full", p.dot)} />)}</span>}
              {pills.slice(0, 2).map((p) => {
                const first = d.date === p.start, last = d.date === p.end, showTitle = first || d.weekday === 1;
                // multi-day entries read as one continuous bar across the cells
                return (
                  <span key={p.key} className={cx("hidden truncate py-0.5 text-[11px] sm:block font-medium leading-tight", p.tone, first ? "ml-0 rounded-l-md pl-1.5" : "-ml-2 rounded-l-none pl-2.5", last ? "mr-0 rounded-r-md pr-1" : "-mr-2 rounded-r-none pr-2.5")}>
                    {showTitle ? <><span aria-hidden className="mr-1 text-[8px]">{p.glyph}</span>{p.label}</> : "\u00a0"}
                  </span>);
              })}
              {pills.length > 2 && <span className="hidden px-1 text-[11px] font-medium text-fg-subtle sm:block">+{pills.length - 2} more</span>}
            </button>);
        })}
      </div>
    </div>
  );
}

function Agenda({ data, writable, onEdit, onDelete }: { data: MonthData; writable: boolean; onEdit: (e: CalendarEntry) => void; onDelete: (e: CalendarEntry) => void }) {
  type Item = { key: string; start: string; end: string; title: string; kind: string; tone: string; scope: string; sample: boolean; entry?: CalendarEntry; description?: string | null };
  const items: Item[] = [
    ...data.entries.map((e): Item => ({ key: e.id, start: e.startsOn, end: e.endsOn, title: e.title, kind: categoryLabels[e.category], tone: pillTone[e.category], scope: campusName(e.campusId), sample: e.isSample, entry: e, description: e.description })),
    ...data.exams.map((e): Item => ({ key: `x${e.id}`, start: e.startsOn, end: e.endsOn, title: e.name, kind: `Exam · ${examTypeLabels[e.type]}`, tone: pillTone.EXAM_PERIOD, scope: e.batchName ?? "Whole cohort", sample: e.isSample })),
  ].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  if (items.length === 0) return <EmptyState title="Nothing on the calendar this month">Use "Add entry" to record a holiday, event, exam period or deadline.</EmptyState>;
  return (
    <ul className="divide-y divide-line rounded-card border border-line bg-surface shadow-soft">
      {items.map((i) => (
        <li key={i.key} className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">{i.title} {i.sample && <SampleBadge />}</p>
            <p className="text-xs text-fg-subtle">{dateRange(i.start, i.end)} · {i.scope}</p>
            {i.description && <p className="text-sm text-fg-muted">{i.description}</p>}
          </div>
          <div className="flex items-center gap-1">
            <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-semibold", i.tone)}>{i.kind}</span>
            {writable && i.entry && <>
              <Button variant="ghost" className="min-h-9 px-2" aria-label={`Edit ${i.title}`} onClick={() => onEdit(i.entry!)}><Pencil className="size-4" aria-hidden /></Button>
              <Button variant="ghost" className="min-h-9 px-2 text-danger" aria-label={`Delete ${i.title}`} onClick={() => onDelete(i.entry!)}><Trash2 className="size-4" aria-hidden /></Button>
            </>}
          </div>
        </li>))}
    </ul>
  );
}

export function AcademicCalendar() {
  const { campusId, can } = useApp();
  const toast = useToast();
  const today = localToday();
  const [month, setMonthRaw] = useState(today.slice(0, 7));
  const [direction, setDirection] = useState(1);
  const setMonth = (next: string) => { setDirection(next >= month ? 1 : -1); setMonthRaw(next); };
  const [track, setTrack] = useState<Track>("MIRAI");
  const [view, setView] = useState<"month" | "agenda">("month");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ entry: CalendarEntry | null; date: string } | null>(null);
  const [deleting, setDeleting] = useState<CalendarEntry | null>(null);
  const res = useResource<MonthData>(campusId ? `/api/calendar/month?campusId=${campusId}&track=${track}&month=${month}` : null);
  const writable = can("academic:write");
  const selectedDate = selected && selected.startsWith(month) ? selected : today.startsWith(month) ? today : `${month}-01`;

  return (
    <div className="stagger space-y-8">
      <PageHeader title="Academic Calendar" subtitle={`${campusName(campusId)} · working days, holidays, events and exam periods`}
        actions={<>
          <Button onClick={() => campusId && void downloadCsv(`/api/calendar/export.csv?campusId=${campusId}`, "calendar.csv")} disabled={!campusId}><Download className="size-4" aria-hidden /> Export CSV</Button>
          {writable && <Button variant="primary" onClick={() => setEditing({ entry: null, date: selectedDate })} disabled={!campusId}><Plus className="size-4" aria-hidden /> Add entry</Button>}
        </>} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Button aria-label="Previous month" className="px-3" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="size-5" aria-hidden /></Button>
          <h2 className="min-w-40 text-center text-base font-semibold text-fg" aria-live="polite">{monthLabel(month)}</h2>
          <Button aria-label="Next month" className="px-3" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="size-5" aria-hidden /></Button>
          <Button variant="ghost" className="text-accent-text" onClick={() => setMonth(today.slice(0, 7))}>Today</Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44"><Field label="Track"><Select value={track} onChange={(e) => setTrack(e.target.value as Track)}>{(Object.keys(trackLabels) as Track[]).map((t) => <option key={t} value={t}>{trackLabels[t]}</option>)}</Select></Field></div>
          <Tabs label="Calendar view" value={view} onChange={setView} tabs={[{ id: "month", label: "Month" }, { id: "agenda", label: "Agenda" }]} />
        </div>
      </div>

      <Boundary res={res} lines={4}>{(data) => (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Saturday rule: <strong className="font-semibold text-fg">{ruleLabels[data.saturdayRule]}</strong>{" "}
            {data.semester ? `(from ${data.semester.name})` : "(default — no semester covers this month for this track)"} · {data.days.filter((d) => d.working).length} working days
          </p>
          <Legend />
          {view === "month" ? (
            <>
              <div key={data.month} className="month-in" style={{ "--dir": direction } as React.CSSProperties}><MonthGrid data={data} selected={selectedDate} onSelect={setSelected} today={today} /></div>
              {data.days.find((d) => d.date === selectedDate) && (
                <DayPanel day={data.days.find((d) => d.date === selectedDate)!} data={data} writable={writable} onAdd={() => setEditing({ entry: null, date: selectedDate })} onEdit={(entry) => setEditing({ entry, date: selectedDate })} onDelete={setDeleting} campusId={campusId!} />)}
            </>
          ) : <Agenda data={data} writable={writable} onEdit={(entry) => setEditing({ entry, date: selectedDate })} onDelete={setDeleting} />}
        </div>)}
      </Boundary>

      {editing && campusId && <EntryDialog entry={editing.entry} defaultDate={editing.date} defaultCampus={campusId} onClose={() => setEditing(null)} onSaved={() => { toast(editing.entry ? "Calendar entry updated" : "Calendar entry added"); setEditing(null); res.reload(); }} />}
      {deleting && <ConfirmDialog title={`Delete "${deleting.title}"?`} message={`This removes the ${categoryLabels[deleting.category].toLowerCase()} (${dateRange(deleting.startsOn, deleting.endsOn)}) from the calendar${deleting.category === "HOLIDAY" ? ", so those days count as working days again" : ""}.`}
        action={() => api.del(`/api/calendar/entries/${deleting.id}`)} onClose={() => setDeleting(null)} onDone={() => { toast("Calendar entry deleted"); setDeleting(null); res.reload(); }} />}
    </div>
  );
}
