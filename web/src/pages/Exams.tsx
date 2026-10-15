import { Download, Info, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, SampleBadge, tableClasses } from "../components/ui";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Dialog } from "../components/ui/Dialog";
import { Field, Input, Select, SubmitFeedback, Textarea, useSubmit } from "../components/ui/forms";
import { Boundary, useResource } from "../components/ui/Resource";
import { useToast } from "../components/ui/Toast";
import { NoSemesters, SemesterSelect, useSemesterChoice } from "../components/SemesterSelect";
import { useApp } from "../context/AppContext";
import { api, downloadCsv } from "../lib/api";
import { dateRange } from "../lib/format";
import { campusName, examTypeLabels, trackLabels, type ExamType } from "../lib/labels";
import type { Batch, Exam, Semester } from "../lib/types";

const typeTone = { SESSIONAL: "neutral", MID_TERM: "warn", PUT: "warn", END_TERM: "danger" } as const;

function ExamDialog({ exam, semester, onClose, onSaved }: { exam: Exam | null; semester: Semester; onClose: () => void; onSaved: () => void }) {
  const batches = useResource<{ batches: Batch[] }>(`/api/batches?semesterId=${semester.id}`);
  const [v, setV] = useState({ name: exam?.name ?? "", type: (exam?.type ?? "SESSIONAL") as ExamType, batchId: exam?.batchId ?? "", startsOn: exam?.startsOn ?? "", endsOn: exam?.endsOn ?? "", notes: exam?.notes ?? "" });
  const s = useSubmit();
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const save = async (confirm: boolean) => {
    const body = { name: v.name, type: v.type, batchId: v.batchId || null, startsOn: v.startsOn, endsOn: v.endsOn, notes: v.notes || null, ...(confirm ? { confirmOverlap: true } : {}) };
    if (await s.run(() => (exam ? api.patch(`/api/exams/${exam.id}`, body) : api.post("/api/exams", { ...body, semesterId: semester.id })), confirm)) onSaved();
  };
  const err = s.fieldErrors;
  return (
    <Dialog title={exam ? `Edit ${exam.name}` : "Schedule an exam"} onClose={onClose}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); void save(false); }} className="space-y-4" noValidate>
        <p className="text-sm text-fg-subtle">{semester.name} · {trackLabels[semester.track]} · {campusName(semester.campusId)} ({semester.startsOn} to {semester.endsOn})</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field required label="Exam name" error={err.name}><Input data-autofocus value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Mid-term" maxLength={100} /></Field>
          <Field label="Exam type" error={err.type}><Select value={v.type} onChange={(e) => set("type", e.target.value as ExamType)}>{(Object.keys(examTypeLabels) as ExamType[]).map((t) => <option key={t} value={t}>{examTypeLabels[t]}</option>)}</Select></Field>
          <Field required label="Start date" error={err.startsOn}><Input type="date" value={v.startsOn} min={semester.startsOn} max={semester.endsOn} onChange={(e) => set("startsOn", e.target.value)} /></Field>
          <Field required label="End date" error={err.endsOn}><Input type="date" value={v.endsOn} min={v.startsOn || semester.startsOn} max={semester.endsOn} onChange={(e) => set("endsOn", e.target.value)} /></Field>
        </div>
        <Field label="Batch scope (optional)" error={err.batchId} hint="Leave as whole cohort to apply to every batch in this semester">
          <Select value={v.batchId} onChange={(e) => set("batchId", e.target.value)}><option value="">Whole cohort (all batches)</option>{batches.data?.batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        </Field>
        <Field label="Notes (optional)" error={err.notes}><Textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} /></Field>
        <SubmitFeedback state={s} onConfirm={() => void save(true)} confirmLabel="Save anyway" />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={s.busy}>{s.busy ? "Saving…" : exam ? "Save changes" : "Schedule exam"}</Button></div>
      </form>
    </Dialog>
  );
}

export function Exams() {
  const { campusId, can } = useApp();
  const toast = useToast();
  const choice = useSemesterChoice(campusId);
  const sem = choice.semester;
  const res = useResource<{ exams: Exam[] }>(sem ? `/api/exams?semesterId=${sem.id}` : null);
  const [editing, setEditing] = useState<Exam | "new" | null>(null);
  const [deleting, setDeleting] = useState<Exam | null>(null);
  const writable = can("academic:write");

  return (
    <div className="stagger space-y-8">
      <PageHeader title="Exam Schedule" subtitle={`${campusName(campusId)} · sessionals, mid-term, PUT and end-term`}
        actions={<>
          {sem && <Button onClick={() => void downloadCsv(`/api/exams/export.csv?semesterId=${sem.id}`, "exams.csv")}><Download className="size-4" aria-hidden /> Export CSV</Button>}
          {writable && sem && <Button variant="primary" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Schedule exam</Button>}
        </>} />
      <p className="flex items-start gap-2 text-sm text-fg-subtle"><Info className="mt-0.5 size-4 shrink-0" aria-hidden /> This page only schedules exams. Exam readiness (comparing syllabus coverage against these dates) is not built yet — it arrives in Phase 4.</p>

      <Boundary res={choice.res} lines={2}>{() => choice.semesters.length === 0 ? <Card><NoSemesters /></Card> : (
        <>
          <SemesterSelect choice={choice} />
          <Boundary res={res}>{({ exams }) => exams.length === 0 ? (
            <Card><EmptyState icon={ShieldCheck} title="No exams scheduled for this semester">{writable ? 'Use "Schedule exam" to add sessionals, a mid-term, the PUT and the end-term.' : "Exam dates will appear here once they are scheduled."}</EmptyState></Card>
          ) : (
            <div className={tableClasses.wrap}>
              <table className={tableClasses.table}>
                <thead><tr>{["Exam", "Type", "Dates", "Scope", "Notes", ...(writable ? ["Actions"] : [])].map((h) => <th key={h} scope="col" className={tableClasses.th}>{h}</th>)}</tr></thead>
                <tbody>{exams.map((e) => (
                  <tr key={e.id}>
                    <td className={tableClasses.td}><span className="flex items-center gap-2 font-semibold text-fg">{e.name} {e.isSample && <SampleBadge />}</span></td>
                    <td className={tableClasses.td}><Badge tone={typeTone[e.type]}>{examTypeLabels[e.type]}</Badge></td>
                    <td className={`${tableClasses.td} whitespace-nowrap`}>{dateRange(e.startsOn, e.endsOn)}</td>
                    <td className={tableClasses.td}>{e.batchName ?? "Whole cohort"}</td>
                    <td className={`${tableClasses.td} max-w-56 truncate text-fg-muted`}>{e.notes ?? "—"}</td>
                    {writable && <td className={tableClasses.td}><div className="flex gap-1.5">
                      <Button className="min-h-9 px-3" aria-label={`Edit ${e.name}`} onClick={() => setEditing(e)}><Pencil className="size-4" aria-hidden /> Edit</Button>
                      <Button className="min-h-9 px-3 text-danger" aria-label={`Delete ${e.name}`} onClick={() => setDeleting(e)}><Trash2 className="size-4" aria-hidden /></Button>
                    </div></td>}
                  </tr>))}
                </tbody>
              </table>
            </div>)}
          </Boundary>
        </>)}
      </Boundary>

      {editing && sem && <ExamDialog exam={editing === "new" ? null : editing} semester={sem} onClose={() => setEditing(null)} onSaved={() => { toast(editing === "new" ? "Exam scheduled" : "Exam updated"); setEditing(null); res.reload(); }} />}
      {deleting && <ConfirmDialog title={`Delete ${deleting.name}?`} message={`${deleting.name} (${dateRange(deleting.startsOn, deleting.endsOn)}) will be removed from the schedule and the calendar.`}
        action={() => api.del(`/api/exams/${deleting.id}`)} onClose={() => setDeleting(null)} onDone={() => { toast("Exam deleted"); setDeleting(null); res.reload(); }} />}
    </div>
  );
}
