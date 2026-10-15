import { CalendarClock, CheckCheck, ClipboardList, History as HistoryIcon, Pencil, PlayCircle, ShieldCheck, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LogSessionDialog } from "../components/LogSessionDialog";
import { Badge, Button, Card, EmptyState, PageHeader, SampleBadge, Tabs } from "../components/ui";
import { Dialog } from "../components/ui/Dialog";
import { Field, Input, Select } from "../components/ui/forms";
import { Boundary, useResource } from "../components/ui/Resource";
import { useToast } from "../components/ui/Toast";
import { useApp } from "../context/AppContext";
import { api } from "../lib/api";
import { hours, localToday, longDate, shortDate } from "../lib/format";
import { campusName, outcomeLabels, reasonLabels, workLabels } from "../lib/labels";
import type { Faculty, Outcome, ScheduleItem, ScheduleResponse, SessionLog, SessionLogDetail } from "../lib/types";

const outcomeTone = { COMPLETED: "good", IN_PROGRESS: "warn", SKIPPED: "neutral", MERGED: "good", CANCELLED: "danger" } as const;

function ClassCard({ item, onOpen, canWrite }: { item: ScheduleItem; onOpen: () => void; canWrite: boolean }) {
  return (
    <li className="surface lift flex flex-wrap items-center gap-4 p-4">
      <div className="w-24 shrink-0 text-sm tabular-nums text-fg-muted"><p className="font-semibold text-fg">{item.startTime}–{item.endTime}</p><p className="text-xs">{hours(item.hours)}{item.kind === "makeup" ? " · make-up" : ""}</p></div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{item.subjectName}</p>
        <p className="truncate text-xs text-fg-subtle">{item.batchName} · {item.facultyName ?? "No faculty"}{item.room ? ` · ${item.room}` : ""}{item.date ? ` · ${shortDate(item.date)}` : ""}</p>
      </div>
      {item.log ? <Badge tone={outcomeTone[item.log.outcome]}>{outcomeLabels[item.log.outcome]}{item.log.revision > 1 ? ` · rev ${item.log.revision}` : ""}</Badge> : <Badge tone="warn">Not logged</Badge>}
      {canWrite && <Button variant={item.log ? "secondary" : "primary"} className="min-h-11" onClick={onOpen} aria-label={`${item.log ? "Correct log for" : "Log session for"} ${item.subjectName}, ${item.batchName}, ${shortDate(item.date)} ${item.startTime}`}>
        {item.log ? <><Pencil className="size-4" aria-hidden /> Correct</> : <><PlayCircle className="size-4" aria-hidden /> Log session</>}</Button>}
    </li>
  );
}

function LogDetail({ id, onClose, canReview, onReviewed }: { id: string; onClose: () => void; canReview: boolean; onReviewed: () => void }) {
  const res = useResource<SessionLogDetail>(`/api/session-logs/${id}`);
  const toast = useToast();
  return (
    <Dialog title="Session log" onClose={onClose} wide>
      <Boundary res={res} lines={3}>{(l) => (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={outcomeTone[l.outcome]}>{outcomeLabels[l.outcome]}</Badge>{l.isSample && <SampleBadge />}{l.reviewedAt ? <Badge tone="good">Reviewed</Badge> : <Badge>Not reviewed</Badge>}<Badge>revision {l.revision}</Badge></div>
          <p className="text-fg-muted"><strong className="text-fg">{l.subjectName}</strong> · {l.batchName} · {longDate(l.heldOn)}{l.slotStart ? ` · ${l.slotStart}–${l.slotEnd}` : " · extra session"} · {hours(l.hoursTaught)} taught{l.outcome === "MERGED" ? " (counted on the primary session)" : ""}</p>
          {l.covered.length > 0 && <div><h3 className="font-semibold text-fg">Covered</h3><ul className="mt-1 list-disc pl-5 text-fg-2">{l.covered.map((t) => <li key={t.topicId}>{t.title} — {t.completionPct >= 100 ? "done" : `${t.completionPct}% in total`}</li>)}</ul></div>}
          {l.leftover.length > 0 && <p><strong className="text-fg">Leftover:</strong> {l.leftover.map((t) => t.title).join(", ")}</p>}
          {l.skipped.length > 0 && <p><strong className="text-fg">Dropped from scope:</strong> {l.skipped.map((t) => t.title).join(", ")}</p>}
          {l.carryForward && <p><strong className="text-fg">Carry-forward:</strong> {l.carryForward}</p>}
          {l.rescheduledTo && <p><strong className="text-fg">Rescheduled to:</strong> {longDate(l.rescheduledTo)}</p>}
          <p className="text-fg-muted">Classwork: {workLabels[l.classworkStatus]} · Homework: {workLabels[l.homeworkStatus]}</p>
          {l.notes && <p><strong className="text-fg">Notes:</strong> {l.notes}</p>}
          <p className="text-xs text-fg-subtle">Logged by {l.loggedByFacultyName ?? l.loggedByRole} ({l.loggedByRole}) · {new Date(l.createdAt).toLocaleString()}{l.reviewNote ? ` · Review note: ${l.reviewNote}` : ""}</p>
          {l.revisions.length > 0 && <div><h3 className="font-semibold text-fg">Correction history</h3><ul className="mt-1 space-y-1 text-fg-2">{l.revisions.map((v) => <li key={v.revision}>Revision {v.revision} replaced on {new Date(v.at).toLocaleString()} by {v.changedByRole}: “{v.note}”</li>)}</ul></div>}
          {canReview && <div className="flex justify-end"><Button variant="primary" disabled={l.reviewedAt !== null} onClick={async () => { await api.post(`/api/session-logs/${l.id}/review`, {}); toast("Marked as reviewed"); onReviewed(); res.reload(); }}><ShieldCheck className="size-4" aria-hidden /> {l.reviewedAt ? "Already reviewed" : "Mark reviewed"}</Button></div>}
        </div>)}
      </Boundary>
    </Dialog>
  );
}

function History({ campusId, canReview, onOpenCorrect }: { campusId: string; canReview: boolean; onOpenCorrect: (l: SessionLog) => void }) {
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [unreviewed, setUnreviewed] = useState(false);
  const res = useResource<{ logs: SessionLog[] }>(`/api/session-logs?campusId=${campusId}&limit=60${outcome ? `&outcome=${outcome}` : ""}${unreviewed ? "&reviewed=false" : ""}`);
  const [viewing, setViewing] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-44"><Field label="Outcome"><Select value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome | "")}><option value="">All outcomes</option>{(Object.keys(outcomeLabels) as Outcome[]).map((o) => <option key={o} value={o}>{outcomeLabels[o]}</option>)}</Select></Field></div>
        {canReview && <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-fg-2"><input type="checkbox" className="size-4" checked={unreviewed} onChange={(e) => setUnreviewed(e.target.checked)} /> Only logs awaiting review</label>}
      </div>
      <Boundary res={res}>{({ logs }) => logs.length === 0 ? <Card><EmptyState icon={HistoryIcon} title="No session logs match">Logs appear here as faculty record their classes.</EmptyState></Card> : (
        <ul className="space-y-2">{logs.map((l) => (
          <li key={l.id} className="surface flex flex-wrap items-start justify-between gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">{l.subjectName} <span className="font-normal text-fg-subtle">· {l.batchName}</span> {l.isSample && <SampleBadge />}</p>
              <p className="text-xs text-fg-subtle">{longDate(l.heldOn)} · {hours(l.hoursTaught)} taught · {l.facultyName ?? "—"}</p>
              <p className="mt-1 text-sm text-fg-2">{l.covered.length ? l.covered.map((t) => `${t.title}${t.completionPct < 100 ? ` (${t.completionPct}%)` : ""}`).join(", ") : l.notes ?? "No topics recorded"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2"><Badge tone={outcomeTone[l.outcome]}>{outcomeLabels[l.outcome]}</Badge>{l.reviewedAt && <Badge tone="good">Reviewed</Badge>}
              <Button className="min-h-10" onClick={() => setViewing(l.id)} aria-label={`Details for ${l.subjectName} on ${shortDate(l.heldOn)}`}>Details</Button>
              <Button className="min-h-10" onClick={() => onOpenCorrect(l)} aria-label={`Correct ${l.subjectName} on ${shortDate(l.heldOn)}`}><Pencil className="size-4" aria-hidden /></Button></div>
          </li>))}</ul>)}
      </Boundary>
      {viewing && <LogDetail id={viewing} canReview={canReview} onClose={() => setViewing(null)} onReviewed={res.reload} />}
    </div>
  );
}

export function SessionLogs() {
  const { campusId, role, can, facultyId, setFacultyId } = useApp();
  const [params, setParams] = useSearchParams();
  const date = params.get("date") ?? localToday();
  const [tab, setTab] = useState<"classes" | "history">("classes");
  const [filterFaculty, setFilterFaculty] = useState("");
  const [editing, setEditing] = useState<ScheduleItem | null>(null);
  const faculty = useResource<{ faculty: Faculty[] }>(campusId ? `/api/faculty?campusId=${campusId}` : null);
  const asFaculty = role === "faculty";
  const writable = can("sessions:write");
  const who = asFaculty ? facultyId : filterFaculty || null;
  const needIdentity = asFaculty && !facultyId;
  const q = (extra: string) => `campusId=${campusId}${who ? `&facultyId=${who}` : ""}${extra}`;
  const schedule = useResource<ScheduleResponse>(campusId && !needIdentity ? `/api/session-logs/schedule?date=${date}&${q("")}` : null);
  const pending = useResource<{ items: ScheduleItem[] }>(campusId && !needIdentity ? `/api/session-logs/pending?${q("&days=14")}` : null);
  const reload = () => { schedule.reload(); pending.reload(); };
  const logToItem = (l: SessionLog): ScheduleItem => ({ key: l.id, kind: l.makeupOfId ? "makeup" : "scheduled", date: l.heldOn, subjectId: l.subjectId, subjectCode: l.subjectCode, subjectName: l.subjectName, batchId: l.batchId, batchName: l.batchName, semesterId: l.semesterId, campusId: l.campusId, track: l.track, facultyId: l.facultyId, facultyName: l.facultyName, entryId: l.timetableEntryId, makeupOfLogId: l.makeupOfId, startTime: l.slotStart ?? "—", endTime: l.slotEnd ?? "—", hours: l.scheduledHours ?? l.hoursTaught, room: null, log: { id: l.id, outcome: l.outcome, revision: l.revision, reviewed: l.reviewedAt !== null } });
  const sameDay = useMemo(() => schedule.data?.items ?? [], [schedule.data]);

  return (
    <div className="stagger space-y-8">
      <PageHeader title="Session Logs" subtitle={`${campusName(campusId)} · record what was taught, then the plan updates itself`} />

      <div className="flex flex-wrap items-end gap-3">
        {asFaculty ? (
          <div className="min-w-56"><Field label="Acting as (demo identity)" hint="Not a login — see Settings → Data & access"><Select value={facultyId ?? ""} onChange={(e) => setFacultyId(e.target.value || null)}><option value="">Choose your name…</option>{faculty.data?.faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field></div>
        ) : (
          <div className="min-w-48"><Field label="Faculty"><Select value={filterFaculty} onChange={(e) => setFilterFaculty(e.target.value)}><option value="">All faculty</option>{faculty.data?.faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field></div>)}
        <Tabs label="Session log sections" value={tab} onChange={setTab} tabs={[{ id: "classes", label: "Classes" }, { id: "history", label: "History" }]} />
      </div>

      {needIdentity ? <Card><EmptyState icon={UserRound} title="Choose who you are">Pick your name above to see your classes. This is a demo-mode identity, not a login — real sign-in arrives in Phase 4.</EmptyState></Card>
        : tab === "history" ? (campusId && <History campusId={campusId} canReview={can("sessions:review")} onOpenCorrect={(l) => setEditing(logToItem(l))} />)
          : (
            <>
              {pending.data && pending.data.items.length > 0 && (
                <section aria-label="Earlier classes without a log" className="space-y-2">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-fg"><CalendarClock className="size-4 text-warn" aria-hidden /> Earlier classes that still need a log <Badge tone="warn">{pending.data.items.length}</Badge></h2>
                  <ul className="space-y-2">{pending.data.items.slice(0, 8).map((i) => <ClassCard key={i.key} item={i} canWrite={writable} onOpen={() => setEditing(i)} />)}</ul>
                  {pending.data.items.length > 8 && <p className="text-xs text-fg-subtle">Showing 8 of {pending.data.items.length}. Log these first — progress is understated until they are recorded.</p>}
                </section>)}

              <section aria-label="Classes on the selected day" className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h2 className="text-sm font-semibold text-fg">Classes on {longDate(date)}{schedule.data?.today === date ? " (today)" : ""}</h2>
                  <div className="flex items-end gap-2"><div className="w-44"><Field label="Date"><Input type="date" value={date} onChange={(e) => e.target.value && setParams({ date: e.target.value })} /></Field></div><Button variant="ghost" onClick={() => setParams({})}>Today</Button></div>
                </div>
                <Boundary res={schedule} lines={2}>{(d) => d.items.length === 0 ? (
                  <Card><EmptyState icon={ClipboardList} title="No classes planned for this day">{d.notices[0] ? `The calendar treats this day as ${reasonLabels[d.notices[0].reason] ?? d.notices[0].reason.replace(/_/g, " ")}.` : "Nothing is scheduled in the timetable for this day."}</EmptyState></Card>
                ) : <ul className="space-y-2">{d.items.map((i) => <ClassCard key={i.key} item={i} canWrite={writable} onOpen={() => setEditing(i)} />)}</ul>}</Boundary>
              </section>
              {!writable && <p className="text-sm text-fg-subtle"><CheckCheck className="mr-1 inline size-4" aria-hidden />Your role can view the plan but not log sessions.</p>}
            </>)}

      {editing && <LogSessionDialog item={editing} sameDayLogs={sameDay.filter((i) => i.date === editing.date)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}
