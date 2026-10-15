import { ArrowDown, ArrowLeft, ArrowUp, Download, FileUp, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card, EmptyState, PageHeader, SampleBadge, tableClasses } from "../components/ui";
import { Dialog } from "../components/ui/Dialog";
import { Button as StatefulButton } from "../components/vendor/aceternity/stateful-button";
import { Input, Select, SubmitFeedback, useSubmit } from "../components/ui/forms";
import { Boundary, useResource } from "../components/ui/Resource";
import { useToast } from "../components/ui/Toast";
import { useApp } from "../context/AppContext";
import { ApiError, api, downloadCsv } from "../lib/api";
import { hours } from "../lib/format";
import { examTypeLabels, type ExamType } from "../lib/labels";
import type { ImportPreview, SyllabusPayload, SyllabusUnit } from "../lib/types";

interface DraftTopic { key: string; id?: string; title: string; hours: string; examScope: ExamType | "" }
interface DraftUnit { key: string; id?: string; title: string; topics: DraftTopic[] }

let counter = 0;
const key = () => `k${++counter}`;
const toDraft = (units: SyllabusUnit[]): DraftUnit[] => units.map((u) => ({ key: key(), id: u.id, title: u.title, topics: u.topics.map((t) => ({ key: key(), id: t.id, title: t.title, hours: String(t.plannedHours), examScope: t.examScope ?? "" })) }));
const toBody = (units: DraftUnit[]) => ({ units: units.map((u) => ({ ...(u.id ? { id: u.id } : {}), title: u.title, topics: u.topics.map((t) => ({ ...(t.id ? { id: t.id } : {}), title: t.title, plannedHours: Number(t.hours), examScope: t.examScope || null })) })) });
const fingerprint = (units: DraftUnit[]) => JSON.stringify(toBody(units));
const swap = <T,>(list: T[], i: number, j: number) => { const out = [...list]; [out[i], out[j]] = [out[j]!, out[i]!]; return out; };

const TEMPLATE = "unit,topic,planned_hours,exam_scope\nUnit 1,Topic 1.1,2,SESSIONAL\nUnit 1,Topic 1.2,1.5,\nUnit 2,Topic 2.1,3,MID_TERM\n";

function ImportDialog({ subjectId, onClose, onImported }: { subjectId: string; onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const s = useSubmit();
  const input = useRef<HTMLInputElement>(null);

  const choose = async (f: File | undefined) => {
    setPreview(null); setReadError(null);
    if (!f) return;
    if (f.size > 1_000_000) { setReadError("That file is larger than 1 MB."); return; }
    const csv = await f.text();
    setFile({ name: f.name, csv });
    await s.run(async () => setPreview(await api.post<ImportPreview>(`/api/subjects/${subjectId}/syllabus/import/preview`, { csv })));
  };
  const commit = async () => {
    if (file && await s.run(() => api.post(`/api/subjects/${subjectId}/syllabus/import`, { csv: file.csv, confirmReplace: true }))) onImported();
  };
  const topics = preview?.units.reduce((n, u) => n + u.topics.length, 0) ?? 0;

  return (
    <Dialog title="Import syllabus from CSV" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">Columns: <code>unit, topic, planned_hours, exam_scope</code> (exam scope optional: SESSIONAL, MID_TERM, PUT or END_TERM). Row order becomes topic order. Nothing is saved until you confirm.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose CSV file" onChange={(e) => void choose(e.target.files?.[0])} />
          <Button data-autofocus onClick={() => input.current?.click()}><FileUp className="size-4" aria-hidden /> {file ? "Choose another file" : "Choose CSV file"}</Button>
          <Button variant="ghost" onClick={() => { const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = "syllabus-template.csv"; a.click(); URL.revokeObjectURL(url); }}><Download className="size-4" aria-hidden /> Download template</Button>
          {file && <span className="text-sm text-fg-subtle">{file.name}</span>}
        </div>
        {readError && <p role="alert" className="text-sm font-medium text-danger">{readError}</p>}
        <SubmitFeedback state={s} />

        {preview && !preview.valid && (
          <div className="space-y-2">
            <p role="alert" className="text-sm font-semibold text-danger">{preview.errors.length} problem(s) found in {preview.rowCount} row(s). Fix the file and choose it again — nothing was imported.</p>
            <div className={`${tableClasses.wrap} max-h-64 overflow-y-auto`}>
              <table className={tableClasses.table} style={{ minWidth: 0 }}>
                <caption className="sr-only">Import errors by row</caption>
                <thead><tr>{["Row", "Column", "Problem"].map((h) => <th key={h} scope="col" className={tableClasses.th}>{h}</th>)}</tr></thead>
                <tbody>{preview.errors.slice(0, 200).map((e, i) => <tr key={i}><td className={`${tableClasses.td} tabular-nums`}>{e.row}</td><td className={tableClasses.td}><code>{e.field}</code></td><td className={tableClasses.td}>{e.message}</td></tr>)}</tbody>
              </table>
            </div>
            {preview.errors.length > 200 && <p className="text-xs text-fg-subtle">Showing the first 200 problems.</p>}
          </div>)}

        {preview?.valid && (
          <div className="space-y-3 rounded-xl border border-accent/25 bg-accent-soft p-4 text-sm">
            <p className="font-semibold text-accent-text">File is valid: {preview.units.length} unit(s), {topics} topic(s), {hours(preview.totalPlannedHours)} in total.</p>
            {preview.existingTopicCount > 0
              ? <p className="text-fg-2">Importing <strong>replaces</strong> the current syllabus ({preview.existingTopicCount} topics). Topics with the same title keep their identity; topics not in the file are removed.</p>
              : <p className="text-fg-2">This subject has no syllabus yet, so nothing will be replaced.</p>}
            <div className="flex justify-end"><Button variant="primary" onClick={() => void commit()} disabled={s.busy}>{s.busy ? "Importing…" : preview.existingTopicCount > 0 ? "Replace syllabus" : "Import syllabus"}</Button></div>
          </div>)}
        {!preview && !file && <EmptyState title="No file chosen yet">The file is checked row by row before anything is saved.</EmptyState>}
        <div className="flex justify-end"><Button onClick={onClose}>Close</Button></div>
      </div>
    </Dialog>
  );
}

function Editor({ data, writable, reload }: { data: SyllabusPayload; writable: boolean; reload: () => void }) {
  const toast = useToast();
  const initial = useMemo(() => toDraft(data.units), [data]);
  const [units, setUnits] = useState<DraftUnit[]>(initial);
  const [importing, setImporting] = useState(false);
  const s = useSubmit();
  useEffect(() => setUnits(initial), [initial]);

  const dirty = useMemo(() => fingerprint(units) !== fingerprint(initial), [units, initial]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const total = units.reduce((n, u) => n + u.topics.reduce((m, t) => m + (Number(t.hours) || 0), 0), 0);
  const updateUnit = (ui: number, patch: Partial<DraftUnit>) => setUnits((us) => us.map((u, i) => (i === ui ? { ...u, ...patch } : u)));
  const updateTopic = (ui: number, ti: number, patch: Partial<DraftTopic>) => setUnits((us) => us.map((u, i) => (i === ui ? { ...u, topics: u.topics.map((t, j) => (j === ti ? { ...t, ...patch } : t)) } : u)));
  const save = async () => {
    const ok = await s.run(() => api.put(`/api/subjects/${data.subject.id}/syllabus`, toBody(units)));
    if (ok) { toast("Syllabus saved"); reload(); }
    return ok; // the Aceternity stateful button shows its success check only when this is not false
  };
  const iconBtn = "min-h-9 px-2";
  const planned = data.subject.plannedHours;

  return (
    <div className="stagger space-y-8">
      <PageHeader title={`${data.subject.name} syllabus`} subtitle={`${data.subject.code} · ${data.subject.batchName}`}
        actions={<>
          <Button onClick={() => void downloadCsv(`/api/subjects/${data.subject.id}/syllabus/export.csv`, "syllabus.csv")}><Download className="size-4" aria-hidden /> Export CSV</Button>
          {writable && <Button onClick={() => setImporting(true)}><FileUp className="size-4" aria-hidden /> Import CSV</Button>}
        </>} />
      {data.subject.isSample && <p className="flex items-center gap-2 text-sm text-warn"><SampleBadge /> This syllabus is placeholder sample data, not a real MSOT course syllabus.</p>}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={planned !== null && Math.abs(planned - total) > 0.001 ? "warn" : "good"}>{hours(total)} in syllabus{planned !== null ? ` · ${hours(planned)} planned for the subject` : ""}</Badge>
        {planned !== null && Math.abs(planned - total) > 0.001 && <span className="text-warn">Syllabus hours and subject planned hours differ by {hours(Math.abs(planned - total))}.</span>}
        {dirty && <Badge tone="warn">Unsaved changes</Badge>}
      </div>

      {units.length === 0 && <Card><EmptyState title="No syllabus yet">{writable ? "Add a unit and its topics below, or import a CSV." : "A syllabus has not been added for this subject."}</EmptyState></Card>}

      <ol className="space-y-4">
        {units.map((u, ui) => (
          <li key={u.key}>
            <Card>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-fg-subtle">Unit {ui + 1}</span>
                <div className="min-w-48 flex-1"><Input aria-label={`Unit ${ui + 1} title`} value={u.title} disabled={!writable} onChange={(e) => updateUnit(ui, { title: e.target.value })} maxLength={120} placeholder="Unit title" /></div>
                {writable && <div className="flex gap-1">
                  <Button variant="ghost" className={iconBtn} aria-label={`Move unit ${ui + 1} up`} disabled={ui === 0} onClick={() => setUnits((us) => swap(us, ui, ui - 1))}><ArrowUp className="size-4" aria-hidden /></Button>
                  <Button variant="ghost" className={iconBtn} aria-label={`Move unit ${ui + 1} down`} disabled={ui === units.length - 1} onClick={() => setUnits((us) => swap(us, ui, ui + 1))}><ArrowDown className="size-4" aria-hidden /></Button>
                  <Button variant="ghost" className={`${iconBtn} text-danger`} aria-label={`Remove unit ${ui + 1}`} onClick={() => setUnits((us) => us.filter((_, i) => i !== ui))}><Trash2 className="size-4" aria-hidden /></Button>
                </div>}
              </div>
              <ul className="space-y-2">
                {u.topics.map((t, ti) => (
                  <li key={t.key} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[2rem_1fr_6rem_14rem_auto]">
                    <span className="hidden text-xs tabular-nums text-fg-subtle sm:block">{ui + 1}.{ti + 1}</span>
                    <Input aria-label={`Unit ${ui + 1} topic ${ti + 1} title`} value={t.title} disabled={!writable} onChange={(e) => updateTopic(ui, ti, { title: e.target.value })} maxLength={160} placeholder="Topic" className="col-span-2 sm:col-span-1" />
                    <Input aria-label={`Unit ${ui + 1} topic ${ti + 1} planned hours`} type="number" min="0" step="0.5" value={t.hours} disabled={!writable} onChange={(e) => updateTopic(ui, ti, { hours: e.target.value })} placeholder="Hours" />
                    <Select aria-label={`Unit ${ui + 1} topic ${ti + 1} exam scope`} value={t.examScope} disabled={!writable} onChange={(e) => updateTopic(ui, ti, { examScope: e.target.value as ExamType | "" })}>
                      <option value="">No exam scope</option>{(Object.keys(examTypeLabels) as ExamType[]).map((x) => <option key={x} value={x}>{examTypeLabels[x]}</option>)}
                    </Select>
                    {writable && <div className="flex gap-0.5">
                      <Button variant="ghost" className={iconBtn} aria-label={`Move topic ${ui + 1}.${ti + 1} up`} disabled={ti === 0} onClick={() => updateUnit(ui, { topics: swap(u.topics, ti, ti - 1) })}><ArrowUp className="size-4" aria-hidden /></Button>
                      <Button variant="ghost" className={iconBtn} aria-label={`Move topic ${ui + 1}.${ti + 1} down`} disabled={ti === u.topics.length - 1} onClick={() => updateUnit(ui, { topics: swap(u.topics, ti, ti + 1) })}><ArrowDown className="size-4" aria-hidden /></Button>
                      <Button variant="ghost" className={`${iconBtn} text-danger`} aria-label={`Remove topic ${ui + 1}.${ti + 1}`} onClick={() => updateUnit(ui, { topics: u.topics.filter((_, j) => j !== ti) })}><Trash2 className="size-4" aria-hidden /></Button>
                    </div>}
                  </li>))}
              </ul>
              {writable && <Button className="mt-3 min-h-9" onClick={() => updateUnit(ui, { topics: [...u.topics, { key: key(), title: "", hours: "1", examScope: "" }] })}><Plus className="size-4" aria-hidden /> Add topic</Button>}
            </Card>
          </li>))}
      </ol>

      {writable && (
        <div className="glass sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-2 rounded-card px-4 py-3 lg:bottom-4">
          <Button onClick={() => setUnits((us) => [...us, { key: key(), title: "", topics: [{ key: key(), title: "", hours: "1", examScope: "" }] }])}><Plus className="size-4" aria-hidden /> Add unit</Button>
          <div className="flex items-center gap-2">
            <Button onClick={() => { setUnits(initial); s.reset(); }} disabled={!dirty || s.busy}><Undo2 className="size-4" aria-hidden /> Discard</Button>
            <StatefulButton onClick={save} disabled={!dirty || s.busy}><Save className="size-4" aria-hidden /> Save syllabus</StatefulButton>
          </div>
        </div>)}
      <SubmitFeedback state={s} />
      {Object.keys(s.fieldErrors).length > 0 && <ul role="alert" className="list-disc space-y-1 rounded-xl bg-danger-soft p-3 pl-7 text-sm text-danger">{Object.entries(s.fieldErrors).map(([k, m]) => <li key={k}>{m}</li>)}</ul>}
      {importing && <ImportDialog subjectId={data.subject.id} onClose={() => setImporting(false)} onImported={() => { setImporting(false); toast("Syllabus imported"); reload(); }} />}
    </div>
  );
}

export function Syllabus() {
  const { id } = useParams();
  const { can } = useApp();
  const res = useResource<SyllabusPayload>(id ? `/api/subjects/${id}/syllabus` : null);
  const notFound = res.error instanceof ApiError && res.error.status === 404;
  return (
    <div className="space-y-6">
      <Link to="/subjects" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-text hover:underline"><ArrowLeft className="size-4" aria-hidden /> Back to Subjects</Link>
      {notFound ? <Card><EmptyState title="Subject not found">It may have been deleted. Go back to the subjects list.</EmptyState></Card>
        : <Boundary res={res} lines={4}>{(data) => <Editor data={data} writable={can("academic:write")} reload={res.reload} />}</Boundary>}
    </div>
  );
}
