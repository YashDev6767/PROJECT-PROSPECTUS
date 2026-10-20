import { BookOpenCheck, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, EmptyState, PageHeader, RiskBadge, SampleBadge, tableClasses } from "../components/ui";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Dialog } from "../components/ui/Dialog";
import { Field, Input, Select, SubmitFeedback, useSubmit } from "../components/ui/forms";
import { Boundary, useResource } from "../components/ui/Resource";
import { useToast } from "../components/ui/Toast";
import { NoSemesters, SemesterSelect, useSemesterChoice } from "../components/SemesterSelect";
import { useApp } from "../context/AppContext";
import { api, downloadCsv } from "../lib/api";
import { hours } from "../lib/format";
import { campusName } from "../lib/labels";
import type { Batch, Faculty, Subject } from "../lib/types";

function SubjectDialog({ subject, semesterId, campusId, onClose, onSaved }: { subject: Subject | null; semesterId: string; campusId: string; onClose: () => void; onSaved: () => void }) {
  const batches = useResource<{ batches: Batch[] }>(`/api/batches?semesterId=${semesterId}`);
  const faculty = useResource<{ faculty: Faculty[] }>(`/api/faculty?campusId=${campusId}`);
  const [v, setV] = useState({ code: subject?.code ?? "", name: subject?.name ?? "", batchId: subject?.batchId ?? "", facultyId: subject?.facultyId ?? "", plannedHours: subject?.plannedHours?.toString() ?? "" });
  const s = useSubmit();
  const set = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { code: v.code, name: v.name, batchId: v.batchId || undefined, facultyId: v.facultyId || null, plannedHours: v.plannedHours === "" ? null : Number(v.plannedHours) };
    if (await s.run(() => (subject ? api.patch(`/api/subjects/${subject.id}`, body) : api.post("/api/subjects", body)))) onSaved();
  };
  const err = s.fieldErrors;
  const noBatches = batches.data?.batches.length === 0;
  return (
    <Dialog title={subject ? `Edit ${subject.code}` : "Add subject"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {noBatches && <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn">This semester has no batches yet. Add one under Settings → Batches first.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field required label="Subject code" error={err.code}><Input data-autofocus value={v.code} onChange={(e) => set("code", e.target.value)} maxLength={20} /></Field>
          <Field required label="Subject name" error={err.name}><Input value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={120} /></Field>
          <Field required label="Batch" error={err.batchId} hint={subject ? "A subject can move to another batch of the same semester" : undefined}>
            <Select value={v.batchId} onChange={(e) => set("batchId", e.target.value)}><option value="">Select a batch…</option>{batches.data?.batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          </Field>
          <Field label="Faculty" error={err.facultyId}>
            <Select value={v.facultyId} onChange={(e) => set("facultyId", e.target.value)}><option value="">Unassigned</option>{faculty.data?.faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
          </Field>
        </div>
        <Field label="Planned teaching hours (optional)" error={err.plannedHours} hint="Total hours planned for the semester, if known"><Input type="number" min="0" step="0.5" value={v.plannedHours} onChange={(e) => set("plannedHours", e.target.value)} /></Field>
        <SubmitFeedback state={s} />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={s.busy || noBatches}>{s.busy ? "Saving…" : subject ? "Save changes" : "Add subject"}</Button></div>
      </form>
    </Dialog>
  );
}

function CapacityBadge({ s }: { s: Subject }) {
  if (s.weeklyScheduledHours === 0) return <Badge>Not scheduled</Badge>;
  if (s.plannedHours !== null && s.projectedSemesterHours < s.plannedHours) return <Badge tone="warn">Short by {hours(s.plannedHours - s.projectedSemesterHours)}</Badge>;
  return <span className="text-xs text-fg-subtle">Covers plan</span>;
}

export function Subjects() {
  const { campusId, can } = useApp();
  const toast = useToast();
  const choice = useSemesterChoice(campusId);
  const sem = choice.semester;
  const [batchId, setBatchId] = useState("");
  const batches = useResource<{ batches: Batch[] }>(sem ? `/api/batches?semesterId=${sem.id}` : null);
  const res = useResource<{ subjects: Subject[] }>(sem ? `/api/subjects?semesterId=${sem.id}${batchId ? `&batchId=${batchId}` : ""}` : null);
  const [editing, setEditing] = useState<Subject | "new" | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const writable = can("academic:write");

  return (
    <div className="stagger space-y-8">
      <PageHeader title="Subjects" subtitle={`${campusName(campusId)} · subjects, faculty assignments and syllabus`}
        actions={<>
          {sem && <Button onClick={() => void downloadCsv(`/api/subjects/export.csv?semesterId=${sem.id}`, "subjects.csv")}><Download className="size-4" aria-hidden /> Export CSV</Button>}
          {writable && sem && <Button variant="primary" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Add subject</Button>}
        </>} />
      <Boundary res={choice.res} lines={2}>{() => choice.semesters.length === 0 ? <Card><NoSemesters /></Card> : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <SemesterSelect choice={choice} />
            <div className="min-w-48"><Field label="Batch"><Select value={batchId} onChange={(e) => setBatchId(e.target.value)}><option value="">All batches</option>{batches.data?.batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field></div>
          </div>
          <Boundary res={res}>{({ subjects }) => subjects.length === 0 ? (
            <Card><EmptyState icon={BookOpenCheck} title="No subjects here yet">{writable ? 'Add a batch under Settings, then use "Add subject" to assign subjects and faculty to it.' : "Subjects will appear here once they are set up."}</EmptyState></Card>
          ) : (
            <div className={tableClasses.wrap}>
              <table className={`${tableClasses.table} min-w-[62rem]`}>
                <caption className="sr-only">Subjects with derived scheduled hours</caption>
                <thead><tr>{["Subject", "Batch", "Faculty", "Progress", "Plan / syllabus", "Per week", "Capacity", "Actions"].map((h) => <th key={h} scope="col" className={tableClasses.th}>{h}</th>)}</tr></thead>
                <tbody>{subjects.map((s) => (
                  <tr key={s.id}>
                    <td className={`${tableClasses.td} min-w-[15rem]`}><p className="flex items-center gap-2 font-semibold text-fg"><Link to={`/subjects/${s.id}`} className="-my-2.5 inline-block py-2.5 text-accent-text underline-offset-2 hover:underline">{s.name}</Link> {s.isSample && <SampleBadge />}</p><p className="text-xs text-fg-subtle">{s.code}</p></td>
                    <td className={`${tableClasses.td} whitespace-nowrap`}>{s.batchName}</td>
                    <td className={`${tableClasses.td} whitespace-nowrap`}>{s.facultyName ?? <Badge tone="warn">Unassigned</Badge>}</td>
                    <td className={`${tableClasses.td} whitespace-nowrap`}>
                      <Link to={`/subjects/${s.id}`} className="block" aria-label={`Progress details for ${s.name}, ${s.batchName}: ${s.progress.headline}`}>
                        <RiskBadge status={s.progress.risk} />
                        <p className="mt-1 text-xs tabular-nums text-fg-subtle">{s.progress.coveragePct === null ? "no syllabus" : `${s.progress.coveragePct}% · cushion ${s.progress.bufferRatio === null ? "—" : s.progress.bufferRatio.toFixed(2)}`}</p>
                      </Link>
                    </td>
                    <td className={`${tableClasses.td} whitespace-nowrap tabular-nums`}>
                      {s.plannedHours === null ? "—" : hours(s.plannedHours)} <span className="text-fg-faint">/</span> {s.topicCount === 0 ? <Badge>No syllabus</Badge> : <>{hours(s.syllabusPlannedHours)}{s.plannedHours !== null && s.plannedHours !== s.syllabusPlannedHours && <span className="ml-1 text-xs text-warn">≠ plan</span>}</>}
                    </td>
                    <td className={`${tableClasses.td} tabular-nums`}>{hours(s.weeklyScheduledHours)}</td>
                    <td className={tableClasses.td}><p className="tabular-nums">{hours(s.projectedSemesterHours)}</p><CapacityBadge s={s} /></td>
                    <td className={`${tableClasses.td} whitespace-nowrap`}><div className="flex items-center gap-1.5">
                      <Link to={`/subjects/${s.id}/syllabus`} className="inline-flex min-h-11 items-center rounded-xl border border-line-strong lg:min-h-9 bg-surface px-3 text-sm font-semibold hover:bg-surface-2" aria-label={`Syllabus for ${s.name}, ${s.batchName}`}>Syllabus</Link>
                      {writable && <>
                        <Button variant="ghost" className="min-h-11 min-w-11 px-2.5 lg:min-h-9 lg:min-w-9" aria-label={`Edit ${s.name}, ${s.batchName}`} onClick={() => setEditing(s)}><Pencil className="size-4" aria-hidden /></Button>
                        <Button variant="ghost" className="min-h-11 min-w-11 px-2.5 lg:min-h-9 lg:min-w-9 text-danger hover:text-danger" aria-label={`Delete ${s.name}, ${s.batchName}`} onClick={() => setDeleting(s)}><Trash2 className="size-4" aria-hidden /></Button>
                      </>}
                    </div></td>
                  </tr>))}
                </tbody>
              </table>
            </div>)}
          </Boundary>
          <p className="text-xs text-fg-subtle">“Per week” and “Teaching capacity” (hours from semester start to the last class before the end-term) are derived from the timetable and calendar — holidays, the Saturday rule and exam periods are respected. Progress comes from session logs; open a subject to see exactly why it has its status.</p>
        </>)}
      </Boundary>

      {editing && sem && campusId && <SubjectDialog subject={editing === "new" ? null : editing} semesterId={sem.id} campusId={campusId} onClose={() => setEditing(null)} onSaved={() => { toast(editing === "new" ? "Subject added" : "Subject updated"); setEditing(null); res.reload(); }} />}
      {deleting && <ConfirmDialog title={`Delete ${deleting.name}?`} message={`${deleting.name} (${deleting.batchName}) will be removed.`}
        action={(confirm) => api.del(`/api/subjects/${deleting.id}${confirm ? "?confirm=true" : ""}`)} onClose={() => setDeleting(null)} onDone={() => { toast("Subject deleted"); setDeleting(null); res.reload(); }} />}
    </div>
  );
}
