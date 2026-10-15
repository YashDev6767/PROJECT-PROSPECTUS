import { CalendarRange, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, SampleBadge, tableClasses } from "../components/ui";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Dialog } from "../components/ui/Dialog";
import { Field, Input, Select, SubmitFeedback, useSubmit } from "../components/ui/forms";
import { Boundary, useResource } from "../components/ui/Resource";
import { useToast } from "../components/ui/Toast";
import { useApp } from "../context/AppContext";
import { api } from "../lib/api";
import { campusName, campusOptions, ruleLabels, ruleShort, statusLabels, trackLabels, type SaturdayRule, type Track } from "../lib/labels";
import { shortDate } from "../lib/format";
import type { Semester } from "../lib/types";

const statusTone = { upcoming: "neutral", active: "good", completed: "neutral" } as const;

interface FormValues { name: string; academicYear: string; track: Track; campusId: string; startsOn: string; endsOn: string; saturdayRule: SaturdayRule }

function SemesterDialog({ semester, defaultCampus, onClose, onSaved }: { semester: Semester | null; defaultCampus: string; onClose: () => void; onSaved: (s: Semester) => void }) {
  const [v, setV] = useState<FormValues>(semester
    ? { name: semester.name, academicYear: semester.academicYear, track: semester.track, campusId: semester.campusId, startsOn: semester.startsOn, endsOn: semester.endsOn, saturdayRule: semester.saturdayRule }
    : { name: "", academicYear: "", track: "MIRAI", campusId: defaultCampus, startsOn: "", endsOn: "", saturdayRule: "SECOND_FOURTH" });
  const s = useSubmit();
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const locked = semester !== null && (semester.batchCount > 0 || semester.examCount > 0); // campus/track cannot change once used

  const save = async (confirm: boolean) => {
    const body = { ...v, ...(confirm ? { confirmOverlap: true } : {}) };
    const ok = await s.run(async () => onSaved(semester ? await api.patch<Semester>(`/api/semesters/${semester.id}`, body) : await api.post<Semester>("/api/semesters", body)), confirm);
    return ok;
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void save(false); };
  const err = s.fieldErrors;

  return (
    <Dialog title={semester ? `Edit ${semester.name}` : "New semester"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field required label="Semester name" error={err.name}><Input data-autofocus value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Semester 3" maxLength={80} /></Field>
          <Field required label="Academic year" error={err.academicYear} hint="Format 2026-27"><Input value={v.academicYear} onChange={(e) => set("academicYear", e.target.value)} placeholder="2026-27" maxLength={9} /></Field>
          <Field label="Campus" error={err.campusId} hint={locked ? "Locked: this semester already has batches or exams" : undefined}>
            <Select value={v.campusId} disabled={locked} onChange={(e) => set("campusId", e.target.value)}>{campusOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </Field>
          <Field label="Academic track" error={err.track}>
            <Select value={v.track} disabled={locked} onChange={(e) => set("track", e.target.value as Track)}>{(Object.keys(trackLabels) as Track[]).map((t) => <option key={t} value={t}>{trackLabels[t]}</option>)}</Select>
          </Field>
          <Field required label="Start date" error={err.startsOn}><Input type="date" value={v.startsOn} onChange={(e) => set("startsOn", e.target.value)} /></Field>
          <Field required label="End date" error={err.endsOn}><Input type="date" value={v.endsOn} onChange={(e) => set("endsOn", e.target.value)} /></Field>
        </div>
        <Field label="Saturday working-day rule" error={err.saturdayRule} hint="Sundays are never working unless a Special Working Day is added on the calendar.">
          <Select value={v.saturdayRule} onChange={(e) => set("saturdayRule", e.target.value as SaturdayRule)}>{(Object.keys(ruleLabels) as SaturdayRule[]).map((r) => <option key={r} value={r}>{ruleLabels[r]}</option>)}</Select>
        </Field>
        <SubmitFeedback state={s} onConfirm={() => void save(true)} confirmLabel="Save anyway" />
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={s.busy}>{s.busy ? "Saving…" : semester ? "Save changes" : "Create semester"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function Semesters() {
  const { campusId, can } = useApp();
  const toast = useToast();
  const res = useResource<{ semesters: Semester[] }>(campusId ? `/api/semesters?campusId=${campusId}` : null);
  const [editing, setEditing] = useState<Semester | "new" | null>(null);
  const [deleting, setDeleting] = useState<Semester | null>(null);
  const [activating, setActivating] = useState<Semester | null>(null);
  const writable = can("semesters:write");

  return (
    <div className="stagger space-y-8">
      <PageHeader title="Semesters" subtitle={`${campusName(campusId)} · semester dates, tracks and working-day rules`}
        actions={writable && <Button variant="primary" onClick={() => setEditing("new")} disabled={!campusId}><Plus className="size-4" aria-hidden /> New semester</Button>} />
      {!writable && <p className="text-sm text-fg-subtle">You are previewing as a role that can view but not change semesters (demo role — see README).</p>}

      <Boundary res={res}>{({ semesters }) => semesters.length === 0 ? (
        <Card><EmptyState icon={CalendarRange} title="No semesters yet">{writable ? "Create the first semester for this campus to start setting up batches, subjects and timetables." : "An admin needs to create the first semester for this campus."}</EmptyState></Card>
      ) : (
        <div className={tableClasses.wrap}>
          <table className={tableClasses.table}>
            <thead><tr>{["Semester", "Track", "Dates", "Saturdays", "Status", ...(writable ? ["Actions"] : [])].map((h) => <th key={h} scope="col" className={tableClasses.th}>{h}</th>)}</tr></thead>
            <tbody>{semesters.map((s) => (
              <tr key={s.id}>
                <td className={tableClasses.td}><p className="flex items-center gap-2 font-semibold text-fg">{s.name} {s.isSample && <SampleBadge />}</p><p className="text-xs text-fg-subtle">{s.academicYear} · {s.batchCount} batch(es) · {s.examCount} exam(s)</p></td>
                <td className={tableClasses.td}>{trackLabels[s.track]}</td>
                <td className={`${tableClasses.td} whitespace-nowrap`}>{shortDate(s.startsOn)} – {shortDate(s.endsOn)}</td>
                <td className={tableClasses.td}>{ruleShort[s.saturdayRule]}</td>
                <td className={tableClasses.td}>
                  <div className="flex flex-wrap gap-1.5"><Badge tone={statusTone[s.status]}>{statusLabels[s.status]}</Badge>{s.isActive && s.status !== "active" && s.status !== "completed" && <Badge tone="warn">Activated · not started</Badge>}{!s.isActive && s.status === "upcoming" && <Badge>Not activated</Badge>}</div>
                </td>
                {writable && <td className={tableClasses.td}>
                  <div className="flex flex-wrap gap-1.5">
                    <Button className="min-h-9 px-3" onClick={() => setEditing(s)} aria-label={`Edit ${s.name} ${trackLabels[s.track]}`}><Pencil className="size-4" aria-hidden /> Edit</Button>
                    {s.isActive
                      ? <Button className="min-h-9 px-3" aria-label={`Deactivate ${s.name}`} onClick={async () => { await api.post(`/api/semesters/${s.id}/deactivate`); toast(`${s.name} deactivated`); res.reload(); }}><Power className="size-4" aria-hidden /> Deactivate</Button>
                      : s.status !== "completed" && <Button className="min-h-9 px-3" aria-label={`Activate ${s.name} ${trackLabels[s.track]}`} onClick={() => setActivating(s)}><Power className="size-4" aria-hidden /> Activate</Button>}
                    <Button className="min-h-9 px-3 text-danger" onClick={() => setDeleting(s)} aria-label={`Delete ${s.name} ${trackLabels[s.track]}`}><Trash2 className="size-4" aria-hidden /></Button>
                  </div>
                </td>}
              </tr>))}
            </tbody>
          </table>
        </div>
      )}</Boundary>

      {editing && campusId && <SemesterDialog semester={editing === "new" ? null : editing} defaultCampus={campusId} onClose={() => setEditing(null)} onSaved={(s) => { setEditing(null); toast(`${s.name} saved`); res.reload(); }} />}
      {activating && <ConfirmDialog title={`Activate ${activating.name}?`} confirmLabel="Activate" message={`${activating.name} (${trackLabels[activating.track]}) becomes the active semester for ${campusName(activating.campusId)}.`}
        action={(confirm) => api.post(`/api/semesters/${activating.id}/activate`, { confirm })} onClose={() => setActivating(null)} onDone={() => { toast(`${activating.name} activated`); setActivating(null); res.reload(); }} />}
      {deleting && <ConfirmDialog title={`Delete ${deleting.name}?`} message={`This permanently deletes ${deleting.name} (${trackLabels[deleting.track]}, ${deleting.academicYear}). Semesters that still have batches or exams cannot be deleted.`}
        action={() => api.del(`/api/semesters/${deleting.id}`)} onClose={() => setDeleting(null)} onDone={() => { toast(`${deleting.name} deleted`); setDeleting(null); res.reload(); }} />}
    </div>
  );
}
