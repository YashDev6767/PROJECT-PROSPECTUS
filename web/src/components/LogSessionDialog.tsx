import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Skeleton, cx } from "./ui";
import { Dialog } from "./ui/Dialog";
import { Field, Input, Select, SubmitFeedback, Textarea, useSubmit } from "./ui/forms";
import { Boundary, useResource } from "./ui/Resource";
import { useToast } from "./ui/Toast";
import { api } from "../lib/api";
import { longDate } from "../lib/format";
import { outcomeLabels, workLabels } from "../lib/labels";
import type { LogSaveResponse, Outcome, ScheduleItem, SessionLogDetail, SubjectDetail, SubjectSummary, TopicProgress, WorkStatus } from "../lib/types";
import { RiskBadge } from "./ui";

type Mode = "none" | "partial" | "done";
interface TopicDraft { mode: Mode; pct: string }
const outcomes: Outcome[] = ["COMPLETED", "IN_PROGRESS", "SKIPPED", "MERGED", "CANCELLED"];
const teaches = (o: Outcome) => o === "COMPLETED" || o === "IN_PROGRESS" || o === "MERGED";

const summaryLine = (b: SubjectSummary | null, a: SubjectSummary | null) =>
  a ? `Coverage ${b?.coveragePct ?? 0}% → ${a.coveragePct ?? 0}%${a.bufferRatio !== null ? ` · buffer ${a.bufferRatio.toFixed(2)}` : ""}` : "Saved";

export interface LogTarget { item: ScheduleItem }

/** One form for logging and for correcting. Prefilled from the timetable; the common case is outcome + topics + Save. */
export function LogSessionDialog({ item, onClose, onSaved, sameDayLogs }: { item: ScheduleItem; onClose: () => void; onSaved: () => void; sameDayLogs: ScheduleItem[] }) {
  const detail = useResource<SubjectDetail>(`/api/progression/subjects/${item.subjectId}`);
  const existing = useResource<SessionLogDetail>(item.log ? `/api/session-logs/${item.log.id}` : null);
  const loading = detail.data === undefined || (item.log !== null && existing.data === undefined);
  return (
    <Dialog title={item.log ? "Correct this log" : "Log a session"} onClose={onClose} wide>
      <div className="mb-4 space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
        <p className="font-semibold text-fg">{item.subjectName} <span className="font-normal text-fg-subtle">· {item.batchName}</span></p>
        <p className="text-fg-muted">{longDate(item.date)} · {item.startTime}–{item.endTime} · {item.hours} h scheduled{item.kind === "makeup" ? " · make-up for a cancelled class" : ""}</p>
      </div>
      {detail.error && !detail.data ? <Boundary res={detail}>{() => null}</Boundary>
        : loading ? <div aria-busy="true" aria-label="Loading" className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-40" /></div>
          : <LogForm item={item} detail={detail.data!} existing={existing.data ?? null} sameDayLogs={sameDayLogs} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function LogForm({ item, detail, existing, sameDayLogs, onClose, onSaved }: { item: ScheduleItem; detail: SubjectDetail; existing: SessionLogDetail | null; sameDayLogs: ScheduleItem[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const s = useSubmit();
  const topics = detail.progress.topics;
  const [outcome, setOutcome] = useState<Outcome>(existing?.outcome ?? "COMPLETED");
  const [draft, setDraft] = useState<Record<string, TopicDraft>>(() => {
    const d: Record<string, TopicDraft> = {};
    for (const c of existing?.covered ?? []) d[c.topicId] = c.completionPct >= 100 ? { mode: "done", pct: "100" } : { mode: "partial", pct: String(c.completionPct) };
    return d;
  });
  const [leftover, setLeftover] = useState<Set<string>>(() => new Set(existing?.leftover.map((t) => t.topicId)));
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set(existing?.skipped.map((t) => t.topicId)));
  const [showAll, setShowAll] = useState(false);
  const [more, setMore] = useState(false);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [carry, setCarry] = useState(existing?.carryForward ?? "");
  const [hours, setHours] = useState(existing?.actualHours?.toString() ?? "");
  const [classwork, setClasswork] = useState<WorkStatus>(existing?.classworkStatus ?? "NOT_GIVEN");
  const [homework, setHomework] = useState<WorkStatus>(existing?.homeworkStatus ?? "NOT_GIVEN");
  const [resched, setResched] = useState(existing?.rescheduledTo ?? "");
  const [mergedInto, setMergedInto] = useState(existing?.mergedIntoId ?? "");
  const [correction, setCorrection] = useState("");

  // Topics shown first: everything not finished (so the next topics are always at hand) plus anything already touched by this log.
  const visible = useMemo(() => {
    if (showAll) return topics;
    const open = topics.filter((t) => (t.status !== "completed" && t.status !== "skipped") || draft[t.topicId]);
    return open.slice(0, 8);
  }, [topics, showAll, draft]);
  const hidden = topics.length - visible.length;

  const primaries = sameDayLogs.filter((i) => i.log && i.subjectId !== item.subjectId && i.facultyId === item.facultyId && (i.log.outcome === "COMPLETED" || i.log.outcome === "IN_PROGRESS"));
  const err = s.fieldErrors;
  const isExtra = !item.entryId && !item.makeupOfLogId && !existing?.timetableEntryId && !existing?.makeupOfId;

  const setMode = (t: TopicProgress, mode: Mode) => setDraft((d) => {
    const next = { ...d };
    if (mode === "none") delete next[t.topicId];
    else next[t.topicId] = { mode, pct: mode === "done" ? "100" : d[t.topicId]?.pct && d[t.topicId]!.mode === "partial" ? d[t.topicId]!.pct : String(Math.min(99, Math.max(t.completionPct + 25, 50))) };
    return next;
  });
  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); fn(n); };

  const body = () => ({
    outcome,
    covered: teaches(outcome) ? Object.entries(draft).map(([topicId, d]) => ({ topicId, completionPct: d.mode === "done" ? 100 : Number(d.pct) })) : [],
    leftover: teaches(outcome) ? [...leftover].filter((id) => !draft[id]) : [], skipped: teaches(outcome) ? [...skipped].filter((id) => !draft[id]) : [],
    notes: notes || null, carryForward: teaches(outcome) ? carry || null : null, classworkStatus: teaches(outcome) ? classwork : "NOT_GIVEN", homeworkStatus: teaches(outcome) ? homework : "NOT_GIVEN",
    actualHours: (outcome === "COMPLETED" || outcome === "IN_PROGRESS") && hours !== "" ? Number(hours) : null,
    rescheduledTo: outcome === "CANCELLED" && resched ? resched : null, mergedIntoId: outcome === "MERGED" ? mergedInto || null : null,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    let result: LogSaveResponse | null = null;
    const ok = await s.run(async () => {
      result = existing
        ? await api.patch<LogSaveResponse>(`/api/session-logs/${existing.id}`, { ...body(), correctionNote: correction })
        : await api.post<LogSaveResponse>("/api/session-logs", { ...body(), subjectId: item.subjectId, heldOn: item.date, timetableEntryId: item.entryId, makeupOfId: item.makeupOfLogId });
    });
    if (ok) { const r = result as LogSaveResponse | null; toast(`${existing ? "Log corrected" : "Session logged"} — ${summaryLine(r?.progress.before ?? null, r?.progress.after ?? null)}`); onSaved(); }
  };

  const seg = "min-h-11 flex-1 whitespace-nowrap rounded-lg px-2 text-sm font-semibold transition-colors";
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {existing && <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn">This session already has a log (revision {existing.revision}). Saving records a correction: the previous version is kept in the log's history and the review is cleared.</p>}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-fg-2">What happened?</legend>
        <div role="radiogroup" aria-label="Session outcome" className="flex flex-wrap gap-1 rounded-xl bg-surface-3 p-1">
          {outcomes.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={outcome === o} onClick={() => setOutcome(o)} data-autofocus={o === outcome ? true : undefined}
              className={cx(seg, outcome === o ? "bg-accent-soft text-accent-soft-fg shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_40%,transparent)]" : "text-fg-muted hover:bg-surface hover:text-fg")}>{outcomeLabels[o]}</button>))}
        </div>
        {err.outcome && <p role="alert" className="mt-1 text-xs font-medium text-danger">{err.outcome}</p>}
      </fieldset>

      {teaches(outcome) && (
        <section aria-label="Topics covered" className="space-y-3">
          <div className="flex items-baseline justify-between"><h3 className="text-sm font-semibold text-fg">What did you cover?</h3><span className="text-xs text-fg-subtle">Tap Done, or Partly and enter the total % reached</span></div>
          {topics.length === 0 ? <p className="rounded-xl border border-dashed border-line-strong p-3 text-sm text-fg-muted">This subject has no syllabus topics yet. Add them under Subjects → Syllabus, or describe the class in the notes below.</p> : (
            <ul className="space-y-2">
              {visible.map((t) => {
                const d = draft[t.topicId];
                return (
                  <li key={t.topicId} className={cx("rounded-xl border p-2.5", d ? "border-accent/50 bg-accent-soft/50" : "border-line")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold text-fg">{t.title}</p><p className="text-xs text-fg-subtle">{t.unitTitle} · {t.plannedHours} h · {t.status === "skipped" ? "skipped" : `${t.completionPct}% so far`}{t.overdue ? " · overdue" : ""}</p></div>
                      <div role="group" aria-label={`${t.title} progress this session`} className="flex gap-1">
                        {(["none", "partial", "done"] as Mode[]).map((m) => (
                          <button key={m} type="button" aria-pressed={(d?.mode ?? "none") === m} onClick={() => setMode(t, m)}
                            className={cx("min-h-10 rounded-lg border px-3 text-sm font-semibold", (d?.mode ?? "none") === m ? (m === "none" ? "border-line-strong bg-surface-3 text-fg" : "border-accent bg-accent-solid text-on-accent") : "border-line-strong bg-surface text-fg-2 hover:bg-surface-2")}>
                            {m === "none" ? "Not today" : m === "partial" ? "Partly" : "Done"}</button>))}
                      </div>
                    </div>
                    {d?.mode === "partial" && (
                      <div className="mt-2 flex items-center gap-2"><label htmlFor={`pct-${t.topicId}`} className="text-xs font-medium text-fg-muted">Total completion after this session</label>
                        <input id={`pct-${t.topicId}`} type="number" min={t.completionPct + 1} max="99" step="1" value={d.pct} onChange={(e) => setDraft((x) => ({ ...x, [t.topicId]: { mode: "partial", pct: e.target.value } }))} className="min-h-10 w-20 rounded-lg border border-line-strong px-2 text-sm" /><span className="text-sm text-fg-subtle">%</span></div>)}
                  </li>);
              })}
            </ul>)}
          {topics.length > 8 && <Button variant="ghost" className="min-h-9" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer topics" : `Show all ${topics.length} topics${hidden > 0 ? ` (${hidden} more)` : ""}`}</Button>}
          {err.covered && <p role="alert" className="text-sm font-medium text-danger">{err.covered}</p>}

          <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="flex min-h-10 items-center gap-1 text-sm font-semibold text-accent-text">{more ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />} Leftover topics, skipped topics, carry-forward</button>
          {more && (
            <div className="space-y-4 rounded-xl border border-line p-3">
              <div className="grid gap-4 sm:grid-cols-2">
                {([["Leftover (planned, not reached)", leftover, setLeftover], ["Skip (drop from syllabus scope)", skipped, setSkipped]] as const).map(([label, set, setter]) => (
                  <fieldset key={label}><legend className="mb-1 text-sm font-medium text-fg-2">{label}</legend>
                    <div className="max-h-40 space-y-1 overflow-y-auto">{topics.filter((t) => t.status !== "completed" && !draft[t.topicId]).map((t) => (
                      <label key={t.topicId} className="flex min-h-9 items-center gap-2 text-sm text-fg-2"><input type="checkbox" className="size-4" checked={set.has(t.topicId)} onChange={() => toggle(set, t.topicId, setter)} />{t.title}</label>))}</div></fieldset>))}
              </div>
              <Field label="Carry-forward work (for the next class)" error={err.carryForward}><Textarea value={carry} onChange={(e) => setCarry(e.target.value)} maxLength={1000} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Classwork"><Select value={classwork} onChange={(e) => setClasswork(e.target.value as WorkStatus)}>{(Object.keys(workLabels) as WorkStatus[]).map((w) => <option key={w} value={w}>{workLabels[w]}</option>)}</Select></Field>
                <Field label="Homework"><Select value={homework} onChange={(e) => setHomework(e.target.value as WorkStatus)}>{(Object.keys(workLabels) as WorkStatus[]).map((w) => <option key={w} value={w}>{workLabels[w]}</option>)}</Select></Field>
              </div>
            </div>)}
          {(isExtra || outcome === "COMPLETED" || outcome === "IN_PROGRESS") && (
            <Field label={isExtra ? "Hours taught" : "Hours taught (leave empty to use the scheduled length)"} error={err.actualHours}><Input type="number" min="0.25" max="12" step="0.25" value={hours} placeholder={item.hours ? String(item.hours) : "1"} onChange={(e) => setHours(e.target.value)} /></Field>)}
        </section>)}

      {outcome === "MERGED" && (
        <Field label="Merged into which session?" error={err.mergedIntoId} hint="Pick the class you taught together with this batch (same day, same faculty). Teaching hours are counted once, on that session.">
          <Select value={mergedInto} onChange={(e) => setMergedInto(e.target.value)}><option value="">Select the primary session…</option>{primaries.map((p) => <option key={p.log!.id} value={p.log!.id}>{p.subjectName} — {p.batchName} ({p.startTime})</option>)}</Select>
        </Field>)}
      {outcome === "CANCELLED" && <Field label="Reschedule to (optional)" error={err.rescheduledTo} hint="A replacement session is added to the plan on that date"><Input type="date" min={item.date} value={resched} onChange={(e) => setResched(e.target.value)} /></Field>}

      <Field label={outcome === "CANCELLED" || outcome === "SKIPPED" ? "Reason" : "Notes (optional)"} error={err.notes}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder={outcome === "CANCELLED" ? "e.g. Faculty on leave" : ""} /></Field>
      {existing && <Field label="Why are you correcting this log?" error={err.correctionNote} hint="Required — kept in the log's history"><Input value={correction} onChange={(e) => setCorrection(e.target.value)} maxLength={500} /></Field>}

      <p className="text-xs text-fg-subtle">Current status of this subject: <RiskBadge status={detail.progress.risk} /> <span className="ml-1">{detail.progress.coveragePct ?? 0}% covered</span> {existing && <Badge>revision {existing.revision}</Badge>}</p>
      {(["subjectId", "heldOn", "timetableEntryId", "makeupOfId"] as const).some((k) => err[k]) && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger">{(["subjectId", "heldOn", "timetableEntryId", "makeupOfId"] as const).map((k) => err[k]).filter(Boolean).join(" ")}</p>
      )}
      <SubmitFeedback state={s} />
      <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 flex justify-end gap-2 border-t border-line bg-surface/90 px-5 py-3 backdrop-blur">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={s.busy}><CheckCircle2 className="size-4" aria-hidden /> {s.busy ? "Saving…" : existing ? "Save correction" : "Save log"}</Button>
      </div>
    </form>
  );
}

