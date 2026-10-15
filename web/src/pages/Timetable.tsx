import { Clock, Download, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Card, EmptyState, PageHeader, SampleBadge, Tabs, cx } from "../components/ui";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Dialog } from "../components/ui/Dialog";
import { Field, Input, Select, SubmitFeedback, useSubmit } from "../components/ui/forms";
import { Boundary, useResource } from "../components/ui/Resource";
import { useToast } from "../components/ui/Toast";
import { NoSemesters, SemesterSelect, useSemesterChoice } from "../components/SemesterSelect";
import { useApp } from "../context/AppContext";
import { api, downloadCsv } from "../lib/api";
import { hours, shortDate } from "../lib/format";
import { campusName, weekdayNames } from "../lib/labels";
import type { Batch, Faculty, Subject, TimetableEntry } from "../lib/types";

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

export function Timetable() {
  const { campusId, can } = useApp();
  const toast = useToast();
  const choice = useSemesterChoice(campusId);
  const sem = choice.semester;
  const [mode, setMode] = useState<"batch" | "faculty">("batch");
  const [entityId, setEntityId] = useState("");
  const batches = useResource<{ batches: Batch[] }>(sem ? `/api/batches?semesterId=${sem.id}` : null);
  const faculty = useResource<{ faculty: Faculty[] }>(campusId ? `/api/faculty?campusId=${campusId}` : null);
  const filter = entityId ? `&${mode === "batch" ? "batchId" : "facultyId"}=${entityId}` : "";
  const res = useResource<{ entries: TimetableEntry[]; totalWeeklyHours: number }>(sem ? `/api/timetable?semesterId=${sem.id}${filter}` : null);
  const [editing, setEditing] = useState<{ entry: TimetableEntry | null; weekday: number } | null>(null);
  const [deleting, setDeleting] = useState<TimetableEntry | null>(null);
  const writable = can("academic:write");
  const options = mode === "batch" ? batches.data?.batches.map((b) => ({ id: b.id, name: b.name })) : faculty.data?.faculty.map((f) => ({ id: f.id, name: f.name }));

  return (
    <div className="stagger space-y-8">
      <PageHeader title="Timetable" subtitle={`${campusName(campusId)} · weekly classes by batch or faculty`}
        actions={<>
          {sem && <Button onClick={() => void downloadCsv(`/api/timetable/export.csv?semesterId=${sem.id}${filter}`, "timetable.csv")}><Download className="size-4" aria-hidden /> Export CSV</Button>}
          {writable && sem && <Button variant="primary" onClick={() => setEditing({ entry: null, weekday: 1 })}><Plus className="size-4" aria-hidden /> Add class</Button>}
        </>} />
      <Boundary res={choice.res} lines={2}>{() => choice.semesters.length === 0 ? <Card><NoSemesters /></Card> : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <SemesterSelect choice={choice} />
            <Tabs label="Group timetable by" value={mode} onChange={(m) => { setMode(m); setEntityId(""); }} tabs={[{ id: "batch", label: "By batch" }, { id: "faculty", label: "By faculty" }]} />
            <div className="min-w-48"><Field label={mode === "batch" ? "Batch" : "Faculty member"}><Select value={entityId} onChange={(e) => setEntityId(e.target.value)}><option value="">{mode === "batch" ? "All batches" : "All faculty"}</option>{options?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field></div>
          </div>
          <Boundary res={res} lines={4}>{({ entries, totalWeeklyHours }) => entries.length === 0 ? (
            <Card><EmptyState icon={Clock} title="No classes scheduled">{writable ? 'Use "Add class" to place a subject on a weekday. Clashes for the same batch or faculty are blocked with an explanation.' : "The timetable will appear here once classes are scheduled."}</EmptyState></Card>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">{entries.length} classes · <strong className="font-semibold text-fg">{hours(totalWeeklyHours)}</strong> per week (derived from the times below){entries.some((e) => e.isSample) && <><SampleBadge /> includes sample data</>}</p>
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                {[1, 2, 3, 4, 5, 6].map((d) => {
                  const day = entries.filter((e) => e.weekday === d);
                  return (
                    <section key={d} aria-label={weekdayNames[d]} className="surface min-h-24 space-y-2 p-3">
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{weekdayNames[d]}</h2>
                      {day.length === 0 && <p className="text-xs text-fg-subtle">No classes</p>}
                      {day.map((e) => {
                        const inner = (<>
                          <span className="block text-xs font-semibold tabular-nums text-accent-text">{e.startTime}–{e.endTime}</span>
                          <span className="block text-sm font-semibold leading-snug text-fg">{e.subjectName}</span>
                          {e.nextDate !== undefined && <span className="block text-xs text-fg-muted">{e.nextDate ? `Next ${shortDate(e.nextDate)}` : "No more dates"} · {e.loggedCount} logged{e.pastUnlogged ? <span className="font-semibold text-warn"> · {e.pastUnlogged} not logged</span> : null}</span>}
                          <span className="block text-xs text-fg-subtle">{mode === "batch" ? `${entityId ? "" : `${e.batchName} · `}${e.facultyName ?? "No faculty"}` : e.batchName}{e.room ? ` · ${e.room}` : ""}</span>
                        </>);
                        return writable
                          ? <button key={e.id} type="button" onClick={() => setEditing({ entry: e, weekday: d })} aria-label={`Edit ${e.subjectName}, ${e.batchName}, ${e.weekdayName} ${e.startTime}`} className={cx("block w-full space-y-0.5 rounded-xl border border-line bg-surface-2 p-2.5 text-left hover:border-accent/60")}>{inner}</button>
                          : <div key={e.id} className="space-y-0.5 rounded-xl border border-line bg-surface-2 p-2.5">{inner}</div>;
                      })}
                    </section>);
                })}
              </div>
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
