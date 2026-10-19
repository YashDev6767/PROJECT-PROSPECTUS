import { ChevronLeft, ChevronRight, Clock, Download, Plus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, Card, EmptyState, PageHeader, SampleBadge, Tabs } from "../components/ui";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Dialog } from "../components/ui/Dialog";
import { Field, Input, Select, SubmitFeedback, useSubmit } from "../components/ui/forms";
import { Boundary, useResource } from "../components/ui/Resource";
import { useToast } from "../components/ui/Toast";
import { NoSemesters, SemesterSelect, useSemesterChoice } from "../components/SemesterSelect";
import { useApp } from "../context/AppContext";
import { api, downloadCsv } from "../lib/api";
import { hours, localToday } from "../lib/format";
import { campusName, weekdayNames } from "../lib/labels";
import { TimetableGrid, type DayInfo } from "../components/TimetableGrid";
import { addDays, isoWeekday, monthsOf, rangeLabel, weekDates, weekStart } from "../lib/timetableLayout";
import type { Batch, Faculty, MonthData, Subject, TimetableEntry } from "../lib/types";

function SlotDialog({ entry, semesterId, defaultWeekday, onClose, onSaved, onDelete }: { entry: TimetableEntry | null; semesterId: string; defaultWeekday: number; onClose: () => void; onSaved: () => void; onDelete?: () => void }) {
  const subjects = useResource<{ subjects: Subject[] }>(`/api/subjects?semesterId=${semesterId}`);
  const [v, setV] = useState({ subjectId: entry?.subjectId ?? "", weekday: entry?.weekday ?? defaultWeekday, startTime: entry?.startTime ?? "09:00", endTime: entry?.endTime ?? "10:00", room: entry?.room ?? "" });
  const s = useSubmit();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { weekday: v.weekday, startTime: v.startTime, endTime: v.endTime, room: v.room || null };
    if (await s.run(() => (entry ? api.patch(`/api/timetable/${entry.id}`, body) : api.post("/api/timetable", { ...body, subjectId: v.subjectId })))) onSaved();
  };
  const err = s.fieldErrors;
  return (
    <Dialog title={entry ? "Edit class" : "Add class to timetable"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field required label="Subject" error={err.subjectId} hint={entry ? "To change the subject, delete this class and add a new one" : "The batch and faculty come from the subject"}>
          <Select data-autofocus value={v.subjectId} disabled={entry !== null} onChange={(e) => setV({ ...v, subjectId: e.target.value })}>
            <option value="">Select a subject…</option>
            {subjects.data?.subjects.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name} — {x.batchName}{x.facultyName ? ` (${x.facultyName})` : " (no faculty)"}</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Weekday" error={err.weekday}><Select value={v.weekday} onChange={(e) => setV({ ...v, weekday: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{weekdayNames[d]}</option>)}</Select></Field>
          <Field required label="Start time" error={err.startTime}><Input type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} /></Field>
          <Field required label="End time" error={err.endTime}><Input type="time" value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} /></Field>
        </div>
        <Field label="Room (optional)" error={err.room}><Input value={v.room} onChange={(e) => setV({ ...v, room: e.target.value })} maxLength={40} /></Field>
        <SubmitFeedback state={s} />
        <div className="flex flex-wrap justify-between gap-2">
          <div>{onDelete && <Button className="text-danger" onClick={onDelete}>Delete class</Button>}</div>
          <div className="flex gap-2"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={s.busy}>{s.busy ? "Saving…" : entry ? "Save changes" : "Add class"}</Button></div>
        </div>
      </form>
    </Dialog>
  );
}

const DAYS_SHOWN = 6; // Mon–Sat; Sunday is added only when something is scheduled on it
const longFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function Timetable() {
  const { campusId, can } = useApp();
  const toast = useToast();
  const choice = useSemesterChoice(campusId);
  const sem = choice.semester;
  const today = localToday();
  const [mode, setMode] = useState<"batch" | "faculty">("batch");
  const [entityId, setEntityId] = useState("");
  const [view, setView] = useState<"week" | "day">(() => (typeof window !== "undefined" && window.innerWidth < 768 ? "day" : "week"));
  const [anchor, setAnchor] = useState(today);
  const batches = useResource<{ batches: Batch[] }>(sem ? `/api/batches?semesterId=${sem.id}` : null);
  const faculty = useResource<{ faculty: Faculty[] }>(campusId ? `/api/faculty?campusId=${campusId}` : null);
  const filter = entityId ? `&${mode === "batch" ? "batchId" : "facultyId"}=${entityId}` : "";
  const res = useResource<{ entries: TimetableEntry[]; totalWeeklyHours: number }>(sem ? `/api/timetable?semesterId=${sem.id}${filter}` : null);
  const [editing, setEditing] = useState<{ entry: TimetableEntry | null; weekday: number } | null>(null);
  const [deleting, setDeleting] = useState<TimetableEntry | null>(null);
  const writable = can("academic:write");
  const options = mode === "batch" ? batches.data?.batches.map((b) => ({ id: b.id, name: b.name })) : faculty.data?.faculty.map((f) => ({ id: f.id, name: f.name }));

  // Start on today when it is inside the semester, otherwise on the semester's first day.
  const semId = sem?.id;
  useEffect(() => { if (sem) setAnchor(today >= sem.startsOn && today <= sem.endsOn ? today : sem.startsOn); }, [semId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sundayUsed = res.data?.entries.some((e) => e.weekday === 7) ?? false;
  const week = useMemo(() => weekDates(anchor, sundayUsed ? 7 : DAYS_SHOWN), [anchor, sundayUsed]);
  const dates = view === "week" ? week : [anchor];
  const monthList = monthsOf(week);
  const m1 = useResource<MonthData>(sem ? `/api/calendar/month?campusId=${sem.campusId}&track=${sem.track}&month=${monthList[0]}` : null);
  const m2 = useResource<MonthData>(sem && monthList[1] ? `/api/calendar/month?campusId=${sem.campusId}&track=${sem.track}&month=${monthList[1]}` : null);
  const info = useMemo(() => {
    const out: Record<string, DayInfo> = {};
    const titles = new Map([...(m1.data?.entries ?? []), ...(m2.data?.entries ?? [])].map((e) => [e.id, e.title]));
    for (const m of [m1.data, m2.data]) for (const day of m?.days ?? []) {
      const note = day.reason === "holiday" ? (day.entryIds.map((id) => titles.get(id)).find(Boolean) ?? "Holiday") : day.reason === "saturday_off" ? "Off Saturday" : day.reason === "sunday" ? "Sunday" : day.reason === "special_working_day" ? "Special working day" : undefined;
      out[day.date] = { day, ...(note ? { note } : {}) };
    }
    if (sem) for (const d of dates) out[d] = { ...out[d], outsideSemester: d < sem.startsOn || d > sem.endsOn };
    return out;
  }, [m1.data, m2.data, sem, dates.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = view === "week" ? 7 : 1;
  const label = view === "week" ? rangeLabel(week[0]!, week[week.length - 1]!) : longFmt.format(new Date(`${anchor}T00:00:00Z`));
  const isCurrent = view === "week" ? weekStart(today) === weekStart(anchor) : today === anchor;
  const weekOutside = !!sem && (week[week.length - 1]! < sem.startsOn || week[0]! > sem.endsOn);
  const openEntry = writable ? (e: TimetableEntry) => setEditing({ entry: e, weekday: e.weekday }) : null;

  return (
    <div className="stagger space-y-6">
      <PageHeader title="Timetable" subtitle={`${campusName(campusId)} · the weekly teaching pattern, shown against the academic calendar`}
        actions={<>
          {sem && <Button onClick={() => void downloadCsv(`/api/timetable/export.csv?semesterId=${sem.id}${filter}`, "timetable.csv")}><Download className="size-4" aria-hidden /> Export CSV</Button>}
          {writable && sem && <Button variant="primary" onClick={() => setEditing({ entry: null, weekday: view === "day" ? Math.min(isoWeekday(anchor), 6) : 1 })}><Plus className="size-4" aria-hidden /> Add class</Button>}
        </>} />
      <Boundary res={choice.res} lines={2}>{() => choice.semesters.length === 0 ? <Card><NoSemesters /></Card> : (
        <>
          <div className="surface space-y-3 p-4" role="toolbar" aria-label="Timetable controls">
            <div className="flex flex-wrap items-end gap-3">
              <SemesterSelect choice={choice} />
              <Tabs label="Group timetable by" value={mode} onChange={(m) => { setMode(m); setEntityId(""); }} tabs={[{ id: "batch", label: "By batch" }, { id: "faculty", label: "By faculty" }]} />
              <div className="min-w-48 flex-1 sm:max-w-64"><Field label={mode === "batch" ? "Batch" : "Faculty member"}><Select value={entityId} onChange={(e) => setEntityId(e.target.value)}><option value="">{mode === "batch" ? "All batches" : "All faculty"}</option>{options?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field></div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex gap-1" role="group" aria-label="Change week">
                  <Button className="min-h-10 min-w-11 px-2.5" aria-label={view === "week" ? "Previous week" : "Previous day"} onClick={() => setAnchor(addDays(anchor, -step))}><ChevronLeft className="size-4" aria-hidden /></Button>
                  <Button className="min-h-10" aria-label="Go to today" disabled={isCurrent} onClick={() => setAnchor(today)}>Today</Button>
                  <Button className="min-h-10 min-w-11 px-2.5" aria-label={view === "week" ? "Next week" : "Next day"} onClick={() => setAnchor(addDays(anchor, step))}><ChevronRight className="size-4" aria-hidden /></Button>
                </div>
                <p aria-live="polite" data-testid="range-label" className="text-base font-semibold tabular-nums text-fg">{label}</p>
              </div>
              <Tabs label="Timetable view" value={view} onChange={setView} tabs={[{ id: "week", label: "Week" }, { id: "day", label: "Day" }]} />
            </div>
            {view === "day" && (
              <div role="group" aria-label="Day of the week" className="flex gap-1.5 overflow-x-auto pb-1 pt-0.5">
                {week.map((d) => (
                  <button key={d} type="button" aria-pressed={d === anchor} onClick={() => setAnchor(d)}
                    className={`min-h-11 min-w-16 shrink-0 rounded-xl border px-3 py-1 text-center transition-all ${
                      d === anchor
                        ? "border-accent bg-accent-soft text-accent-soft-fg shadow-sm font-semibold"
                        : "border-line bg-surface text-fg-muted hover:border-line-strong hover:bg-surface-2 hover:text-fg"
                    }`}>
                    <span className="block text-[10px] font-medium uppercase tracking-wider text-fg-subtle">{weekdayNames[isoWeekday(d)]!.slice(0, 3)}</span>
                    <span className="text-sm font-bold tabular-nums text-fg">{Number(d.slice(8))}</span>
                  </button>
                ))}
              </div>)}
          </div>
          <Boundary res={res} lines={4}>{({ entries, totalWeeklyHours }) => entries.length === 0 ? (
            <Card><EmptyState icon={Clock} title="No classes scheduled">{writable ? 'Use "Add class" to place a subject on a weekday. Clashes for the same batch or faculty are blocked with an explanation.' : "The timetable will appear here once classes are scheduled."}</EmptyState></Card>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">{entries.length} classes · <strong className="font-semibold text-fg">{hours(totalWeeklyHours)}</strong> per week (derived from the times below){entries.some((e) => e.isSample) && <><SampleBadge /> includes sample data</>}</p>
              {weekOutside && sem && <p role="status" className="rounded-xl border border-line bg-surface-2 p-3 text-sm text-fg-muted">This {view} is outside {sem.name} ({rangeLabel(sem.startsOn, sem.endsOn)}), so no classes run. Use Today or the arrows to move back.</p>}
              {(m1.error || m2.error) && <p role="status" className="text-xs text-warn">Holidays and exam periods could not be loaded; the weekly pattern is shown without them.</p>}
              <TimetableGrid entries={entries} dates={dates} info={info} today={today} showBatch={mode === "faculty" || !entityId} onOpen={openEntry} />
            </>)}
          </Boundary>
        </>)}
      </Boundary>

      {editing && sem && <SlotDialog entry={editing.entry} semesterId={sem.id} defaultWeekday={editing.weekday} onClose={() => setEditing(null)}
        onSaved={() => { toast(editing.entry ? "Class updated" : "Class added"); setEditing(null); res.reload(); }} onDelete={editing.entry ? () => { setDeleting(editing.entry); setEditing(null); } : undefined} />}
      {deleting && <ConfirmDialog title="Delete this class?" message={`${deleting.subjectName} · ${deleting.batchName} · ${deleting.weekdayName} ${deleting.startTime}–${deleting.endTime} will be removed from the timetable.`}
        action={() => api.del(`/api/timetable/${deleting.id}`)} onClose={() => setDeleting(null)} onDone={() => { toast("Class deleted"); setDeleting(null); res.reload(); }} />}
    </div>
  );
}
