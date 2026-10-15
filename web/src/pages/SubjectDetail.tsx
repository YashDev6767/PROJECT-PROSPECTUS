import { ArrowLeft, BookOpen, ClipboardPen, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, ButtonLink, Card, EmptyState, RiskBadge, SampleBadge, tableClasses } from "../components/ui";
import { Field, Input } from "../components/ui/forms";
import { Boundary, useResource } from "../components/ui/Resource";
import { useApp } from "../context/AppContext";
import { ApiError } from "../lib/api";
import { hours, longDate, shortDate } from "../lib/format";
import { campusName, outcomeLabels, trackLabels } from "../lib/labels";
import { canLogSessions } from "../lib/roles";
import type { RiskStatus, SubjectDetail as Detail, TopicProgress } from "../lib/types";

const topicTone = { completed: "good", in_progress: "warn", not_started: "neutral", skipped: "neutral" } as const;
const topicLabel = { completed: "Done", in_progress: "In progress", not_started: "Not started", skipped: "Skipped" } as const;

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)} h`;
function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" | "warn" | "good" }) {
  return (
    <div className="surface px-4 py-3">
      <p className="text-xs font-medium text-fg-subtle">{label}</p>
      <p className={`mt-1 text-xl font-semibold tracking-tight tabular-nums ${tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-fg"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

const headlineTone: Record<RiskStatus, string> = { DANGER: "border-danger/30 bg-danger-soft", TIGHT: "border-warn/30 bg-warn-soft", ON_TRACK: "border-accent/30 bg-accent-soft", COMPLETE: "border-accent/30 bg-accent-soft", UNKNOWN: "border-line-strong bg-surface-2" };

function TopicTable({ topics }: { topics: TopicProgress[] }) {
  if (topics.length === 0) return <EmptyState icon={BookOpen} title="No syllabus topics yet">Add topics with planned hours under the subject's syllabus so progress can be measured.</EmptyState>;
  return (
    <div className={tableClasses.wrap}>
      <table className={`${tableClasses.table} min-w-[48rem]`}>
        <caption className="sr-only">Topic progress</caption>
        <thead><tr>{["Topic", "Planned", "Covered", "Status", "Planned finish", "Forecast finish"].map((h) => <th key={h} scope="col" className={tableClasses.th}>{h}</th>)}</tr></thead>
        <tbody>{topics.map((t) => (
          <tr key={t.topicId} className={t.status === "skipped" ? "opacity-60" : ""}>
            <td className={tableClasses.td}><p className="font-semibold text-fg">{t.title}</p><p className="text-xs text-fg-subtle">{t.unitTitle}</p></td>
            <td className={`${tableClasses.td} tabular-nums`}>{hours(t.plannedHours)}</td>
            <td className={`${tableClasses.td} tabular-nums`}>{t.status === "skipped" ? "—" : `${t.completionPct}% · ${hours(t.coveredHours)}`}</td>
            <td className={tableClasses.td}><div className="flex flex-wrap gap-1.5"><Badge tone={topicTone[t.status]}>{topicLabel[t.status]}</Badge>{t.overdue && <Badge tone="danger">Overdue</Badge>}</div></td>
            <td className={`${tableClasses.td} whitespace-nowrap`}>{t.status === "skipped" ? "—" : t.plannedEnd ? shortDate(t.plannedEnd) : <span className="text-fg-subtle">beyond timetable</span>}</td>
            <td className={`${tableClasses.td} whitespace-nowrap`}>{t.forecastEnd ? shortDate(t.forecastEnd) : t.status === "completed" || t.status === "skipped" ? "—" : <span className="text-danger">not reachable</span>}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

export function SubjectDetail() {
  const { id } = useParams();
  const { role } = useApp();
  const [asOf, setAsOf] = useState("");
  const res = useResource<Detail>(id ? `/api/progression/subjects/${id}${asOf ? `?asOf=${asOf}` : ""}` : null);
  const notFound = res.error instanceof ApiError && res.error.status === 404;

  return (
    <div className="stagger space-y-8">
      <Link to="/subjects" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-text hover:underline"><ArrowLeft className="size-4" aria-hidden /> Back to Subjects</Link>
      {notFound ? <Card><EmptyState title="Subject not found">It may have been deleted.</EmptyState></Card> : (
        <Boundary res={res} lines={4}>{(d) => {
          const p = d.progress;
          return (
            <>
              <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-card px-5 py-4">
                <div>
                  <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-fg">{d.subject.name} <RiskBadge status={p.risk} /> {d.subject.isSample && <SampleBadge />}</h1>
                  <p className="text-sm text-fg-subtle">{d.subject.code} · {d.subject.batchName} · {trackLabels[d.subject.track]} · {campusName(d.subject.campusId)} · {d.subject.facultyName ?? "No faculty assigned"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canLogSessions(role) && <ButtonLink to="/session-logs" variant="primary"><ClipboardPen className="size-4" aria-hidden /> Log a session</ButtonLink>}
                  <ButtonLink to={`/subjects/${d.subject.id}/syllabus`}>Syllabus</ButtonLink>
                </div>
              </div>

              <section aria-label="Why this status" className={`rounded-card border p-4 ${headlineTone[p.risk]}`}>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">{(p.risk === "DANGER" || p.risk === "TIGHT") && <TriangleAlert className="size-4" aria-hidden />} Why: {p.headline}</h2>
                {p.reasons.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-2">{p.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
                <p className="mt-3 text-xs text-fg-subtle">Status rule: buffer = available teaching hours ÷ remaining syllabus hours. On track ≥ {p.thresholds.onTrack.toFixed(2)} · Tight ≥ {p.thresholds.tight.toFixed(2)} · Danger below that · Complete when nothing remains. Low progress alone is not danger if the time left still covers the work.</p>
              </section>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="list" aria-label="Progress numbers">
                <Stat label="Planned hours in scope" value={hours(p.hoursInScope)} hint="Skipped topics excluded" />
                <Stat label="Covered" value={hours(p.coveredHours)} hint={p.coveragePct === null ? "No syllabus" : `${p.coveragePct.toFixed(2)}% of scope`} />
                <Stat label="Remaining" value={hours(p.remainingHours)} />
                <Stat label="Available until deadline" value={p.availableHours === null ? "—" : hours(p.availableHours)} hint={`${p.remainingSessions} session(s) left · last class ${shortDate(d.deadline.lastTeachingDate)}`} />
                <Stat label="Buffer ratio" value={p.bufferRatio === null ? "—" : p.bufferRatio.toFixed(2)} hint="available ÷ remaining" tone={p.risk === "DANGER" ? "danger" : p.risk === "TIGHT" ? "warn" : undefined} />
                <Stat label="Pace vs plan" value={signed(p.paceHours)} hint={`${hours(p.plannedToDateHours)} planned by ${shortDate(d.referenceDate)}`} tone={p.paceHours < 0 ? "warn" : "good"} />
                <Stat label="Projected completion" value={p.projectedCompletion ? shortDate(p.projectedCompletion) : p.risk === "COMPLETE" ? "Done" : "Not reachable"} hint={p.projectionNote || `Deadline: ${d.deadline.label}`} />
                <Stat label="Taught so far" value={hours(d.hoursTaught)} hint={d.lastLoggedOn ? `Last logged ${shortDate(d.lastLoggedOn)}` : "Nothing logged yet"} />
              </div>

              <div className="flex flex-wrap items-end gap-3"><div className="w-48"><Field label="As of date (what-if)" hint="Defaults to today"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field></div>
                {asOf && <button type="button" className="min-h-11 text-sm font-semibold text-accent-text underline" onClick={() => setAsOf("")}>Back to today</button>}</div>
              {p.unloggedPastSessions > 0 && p.risk !== "COMPLETE" && <p className="flex items-start gap-2 text-sm text-warn"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {p.unloggedPastSessions} earlier class(es) have no log. <Link className="font-semibold underline" to="/session-logs">Log them</Link> so coverage is not understated.</p>}

              {p.overdueTopics.length > 0 && <Card title={`Overdue topics (${p.overdueTopics.length})`}><ul className="space-y-1.5 text-sm">{p.overdueTopics.map((t) => <li key={t.topicId} className="flex flex-wrap justify-between gap-2"><span className="font-semibold text-fg">{t.title}</span><span className="text-fg-muted">planned by {shortDate(t.plannedEnd)} · {t.completionPct}% done</span></li>)}</ul></Card>}

              <section aria-label="Topic progress" className="space-y-2"><h2 className="text-sm font-semibold text-fg">Topics</h2><TopicTable topics={p.topics} /></section>

              <Card title="Recent sessions">
                {d.recentLogs.length === 0 ? <EmptyState title="No sessions logged yet" /> : (
                  <ul className="divide-y divide-line">{d.recentLogs.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 first:pt-0 last:pb-0 text-sm">
                      <div><p className="font-semibold text-fg">{longDate(l.heldOn)}</p><p className="text-fg-muted">{l.covered.length ? l.covered.map((t) => `${t.title}${t.completionPct < 100 ? ` (${t.completionPct}%)` : ""}`).join(", ") : l.notes ?? "—"}</p></div>
                      <Badge tone={l.outcome === "CANCELLED" ? "danger" : l.outcome === "SKIPPED" ? "neutral" : "good"}>{outcomeLabels[l.outcome]}</Badge></li>))}</ul>)}
              </Card>
            </>);
        }}</Boundary>)}
    </div>
  );
}
