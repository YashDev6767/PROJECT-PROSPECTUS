import { Database, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, SampleBadge, Tabs, tableClasses } from "../components/ui";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Dialog } from "../components/ui/Dialog";
import { Field, Input, Select, SubmitFeedback, useSubmit } from "../components/ui/forms";
import { Boundary, useResource } from "../components/ui/Resource";
import { useToast } from "../components/ui/Toast";
import { useApp } from "../context/AppContext";
import { api } from "../lib/api";
import { hours } from "../lib/format";
import { campusName, campusOptions, trackLabels } from "../lib/labels";
import { roleLabels } from "../lib/roles";
import type { Health, Batch, Faculty, Semester } from "../lib/types";

/* ---------- batches ---------- */
function BatchDialog({ batch, campusId, onClose, onSaved }: { batch: Batch | null; campusId: string; onClose: () => void; onSaved: () => void }) {
  const semesters = useResource<{ semesters: Semester[] }>(`/api/semesters?campusId=${campusId}`);
  const [v, setV] = useState({ name: batch?.name ?? "", semesterId: batch?.semesterId ?? "", studentCount: batch?.studentCount?.toString() ?? "" });
  const s = useSubmit();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const studentCount = v.studentCount === "" ? null : Number(v.studentCount);
    if (await s.run(() => (batch ? api.patch(`/api/batches/${batch.id}`, { name: v.name, studentCount }) : api.post("/api/batches", { name: v.name, semesterId: v.semesterId || undefined, studentCount })))) onSaved();
  };
  const err = s.fieldErrors;
  return (
    <Dialog title={batch ? `Edit ${batch.name}` : "Add batch"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field required label="Batch name" error={err.name}><Input data-autofocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={60} /></Field>
        <Field required label="Semester" error={err.semesterId} hint={batch ? "A batch stays in its semester; campus and track come from it" : "Campus and academic track come from the semester"}>
          <Select value={v.semesterId} disabled={batch !== null} onChange={(e) => setV({ ...v, semesterId: e.target.value })}>
            <option value="">Select a semester…</option>
            {(batch ? [{ id: batch.semesterId, name: batch.semesterName, track: batch.track, academicYear: "" }] : semesters.data?.semesters ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} · {trackLabels[x.track]}{x.academicYear ? ` · ${x.academicYear}` : ""}</option>)}
          </Select>
        </Field>
        <Field label="Student count (optional)" error={err.studentCount}><Input type="number" min="0" step="1" value={v.studentCount} onChange={(e) => setV({ ...v, studentCount: e.target.value })} /></Field>
        <SubmitFeedback state={s} />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={s.busy}>{s.busy ? "Saving…" : batch ? "Save changes" : "Add batch"}</Button></div>
      </form>
    </Dialog>
  );
}

function BatchesTab({ campusId, writable }: { campusId: string; writable: boolean }) {
  const toast = useToast();
  const res = useResource<{ batches: Batch[] }>(`/api/batches?campusId=${campusId}`);
  const [editing, setEditing] = useState<Batch | "new" | null>(null);
  const [deleting, setDeleting] = useState<Batch | null>(null);
  return (
    <div className="space-y-4">
      {writable && <div className="flex justify-end"><Button variant="primary" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Add batch</Button></div>}
      <Boundary res={res}>{({ batches }) => batches.length === 0 ? <Card><EmptyState icon={Users} title="No batches yet">{writable ? "Create a semester, then add its batches here." : "No batches have been set up for this campus."}</EmptyState></Card> : (
        <div className={tableClasses.wrap}>
          <table className={tableClasses.table}>
            <thead><tr>{["Batch", "Semester", "Track", "Students", "Subjects", ...(writable ? ["Actions"] : [])].map((h) => <th key={h} scope="col" className={tableClasses.th}>{h}</th>)}</tr></thead>
            <tbody>{batches.map((b) => (
              <tr key={b.id}>
                <td className={tableClasses.td}><span className="flex items-center gap-2 font-semibold text-fg">{b.name} {b.isSample && <SampleBadge />}</span></td>
                <td className={tableClasses.td}>{b.semesterName}</td><td className={tableClasses.td}>{trackLabels[b.track]}</td>
                <td className={`${tableClasses.td} tabular-nums`}>{b.studentCount ?? "—"}</td><td className={`${tableClasses.td} tabular-nums`}>{b.subjectCount}</td>
                {writable && <td className={tableClasses.td}><div className="flex gap-1.5">
                  <Button className="min-h-9 px-3" aria-label={`Edit ${b.name} (${b.semesterName}, ${trackLabels[b.track]})`} onClick={() => setEditing(b)}><Pencil className="size-4" aria-hidden /></Button>
                  <Button className="min-h-9 px-3 text-danger" aria-label={`Delete ${b.name} (${b.semesterName}, ${trackLabels[b.track]})`} onClick={() => setDeleting(b)}><Trash2 className="size-4" aria-hidden /></Button>
                </div></td>}
              </tr>))}
            </tbody>
          </table>
        </div>)}
      </Boundary>
      {editing && <BatchDialog batch={editing === "new" ? null : editing} campusId={campusId} onClose={() => setEditing(null)} onSaved={() => { toast("Batch saved"); setEditing(null); res.reload(); }} />}
      {deleting && <ConfirmDialog title={`Delete ${deleting.name}?`} message="Batches that still have subjects or exams cannot be deleted — remove those first." action={() => api.del(`/api/batches/${deleting.id}`)} onClose={() => setDeleting(null)} onDone={() => { toast("Batch deleted"); setDeleting(null); res.reload(); }} />}
    </div>
  );
}

/* ---------- faculty ---------- */
function FacultyDialog({ person, campusId, onClose, onSaved }: { person: Faculty | null; campusId: string; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: person?.name ?? "", email: person?.email ?? "", campusId: person?.campusId ?? campusId });
  const s = useSubmit();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { name: v.name, campusId: v.campusId, email: v.email || null };
    if (await s.run(() => (person ? api.patch(`/api/faculty/${person.id}`, body) : api.post("/api/faculty", body)))) onSaved();
  };
  const err = s.fieldErrors;
  return (
    <Dialog title={person ? `Edit ${person.name}` : "Add faculty member"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field required label="Full name" error={err.name}><Input data-autofocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={100} /></Field>
        <Field label="Email (optional)" error={err.email}><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label="Campus" error={err.campusId}><Select value={v.campusId} onChange={(e) => setV({ ...v, campusId: e.target.value })}>{campusOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <SubmitFeedback state={s} />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={s.busy}>{s.busy ? "Saving…" : person ? "Save changes" : "Add faculty"}</Button></div>
      </form>
    </Dialog>
  );
}

function FacultyTab({ campusId, writable }: { campusId: string; writable: boolean }) {
  const toast = useToast();
  const res = useResource<{ faculty: Faculty[] }>(`/api/faculty?campusId=${campusId}`);
  const [editing, setEditing] = useState<Faculty | "new" | null>(null);
  const [deleting, setDeleting] = useState<Faculty | null>(null);
  return (
    <div className="space-y-4">
      {writable && <div className="flex justify-end"><Button variant="primary" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Add faculty</Button></div>}
      <Boundary res={res}>{({ faculty }) => faculty.length === 0 ? <Card><EmptyState icon={Users} title="No faculty records yet">{writable ? 'Use "Add faculty" so subjects and timetable classes can be assigned to people.' : "No faculty have been added for this campus."}</EmptyState></Card> : (
        <div className={tableClasses.wrap}>
          <table className={tableClasses.table}>
            <thead><tr>{["Name", "Email", "Subjects", "Weekly hours", ...(writable ? ["Actions"] : [])].map((h) => <th key={h} scope="col" className={tableClasses.th}>{h}</th>)}</tr></thead>
            <tbody>{faculty.map((f) => (
              <tr key={f.id}>
                <td className={tableClasses.td}><span className="flex items-center gap-2 font-semibold text-fg">{f.name} {f.isSample && <SampleBadge />}</span></td>
                <td className={tableClasses.td}>{f.email ?? "—"}</td><td className={`${tableClasses.td} tabular-nums`}>{f.subjectCount}</td><td className={`${tableClasses.td} tabular-nums`}>{hours(f.weeklyHours)}</td>
                {writable && <td className={tableClasses.td}><div className="flex gap-1.5">
                  <Button className="min-h-9 px-3" aria-label={`Edit ${f.name}`} onClick={() => setEditing(f)}><Pencil className="size-4" aria-hidden /></Button>
                  <Button className="min-h-9 px-3 text-danger" aria-label={`Delete ${f.name}`} onClick={() => setDeleting(f)}><Trash2 className="size-4" aria-hidden /></Button>
                </div></td>}
              </tr>))}
            </tbody>
          </table>
        </div>)}
      </Boundary>
      {editing && <FacultyDialog person={editing === "new" ? null : editing} campusId={campusId} onClose={() => setEditing(null)} onSaved={() => { toast("Faculty saved"); setEditing(null); res.reload(); }} />}
      {deleting && <ConfirmDialog title={`Delete ${deleting.name}?`} message="Faculty who are assigned to subjects cannot be deleted — reassign those subjects first." action={() => api.del(`/api/faculty/${deleting.id}`)} onClose={() => setDeleting(null)} onDone={() => { toast("Faculty deleted"); setDeleting(null); res.reload(); }} />}
    </div>
  );
}

/* ---------- data & access ---------- */
function DataTab() {
  const { role } = useApp();
  const health = useResource<Health>("/api/health");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Database">
        <Boundary res={health} lines={1}>{(h) => (
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2"><Database className="size-4 text-fg-subtle" aria-hidden /> PostgreSQL: <Badge tone={h.database.state === "connected" ? "good" : "warn"}>{h.database.state.replace("_", " ")}</Badge></p>
            {h.database.state === "connected" && <p className="text-fg-subtle">Round trip {h.database.latencyMs} ms</p>}
            {h.database.detail && <p className="text-fg-subtle">{h.database.detail}</p>}
            <p className="text-fg-muted">Academic setup (semesters, calendar, exams, batches, subjects, timetable, syllabus) is stored in this database.</p>
          </div>)}
        </Boundary>
      </Card>
      <Card title="Sample data">
        <div className="space-y-2 text-sm text-fg-muted">
          <p>Rows marked <SampleBadge /> are demonstration data (placeholder names, codes and syllabus topics — not real MSOT courses or people). The Overview dashboard also still runs on its own built-in demo dataset.</p>
          <pre className="overflow-x-auto rounded-lg bg-surface-3 p-3 text-xs text-fg-2">{"npm run db:seed          # add sample data (safe to re-run)\nnpm run db:clear-sample   # remove only sample rows"}</pre>
        </div>
      </Card>
      <Card title="Access (demo only)" className="lg:col-span-2">
        <p className="text-sm text-fg-muted">You are previewing as <strong className="font-semibold text-fg">{roleLabels[role]}</strong>. The role selector in the top bar is a demo aid: the browser sends it to the API as an <code>X-Demo-Role</code> header and the API enforces a permission matrix on it — but anyone can send any header, so this is <strong className="font-semibold">not real security</strong>. Real sign-in and role enforcement arrive in Phase 4.</p>
        <ul className="mt-3 grid gap-1.5 text-sm text-fg-muted sm:grid-cols-2">
          <li><strong className="font-semibold text-fg">Admin</strong> — everything, including semesters and reviewing session logs</li>
          <li><strong className="font-semibold text-fg">Campus Manager</strong> — all academic setup except semesters; can log on behalf and review session logs</li>
          <li><strong className="font-semibold text-fg">Faculty</strong> — logs and corrects sessions only for subjects assigned to the faculty member chosen under “Acting as” (also unverified); academic setup is read-only</li>
          <li><strong className="font-semibold text-fg">Student</strong> — read-only</li>
        </ul>
      </Card>
    </div>
  );
}

export function Settings() {
  const { campusId, can } = useApp();
  const [tab, setTab] = useState<"batches" | "faculty" | "data">("batches");
  const writable = can("academic:write");
  return (
    <div className="stagger space-y-8">
      <PageHeader title="Settings" subtitle={`${campusName(campusId)} · batches, faculty and data status`} />
      <Tabs label="Settings sections" value={tab} onChange={setTab} tabs={[{ id: "batches", label: "Batches" }, { id: "faculty", label: "Faculty" }, { id: "data", label: "Data & access" }]} />
      {tab === "batches" && campusId && <BatchesTab campusId={campusId} writable={writable} />}
      {tab === "faculty" && campusId && <FacultyTab campusId={campusId} writable={writable} />}
      {tab === "data" && <DataTab />}
    </div>
  );
}
