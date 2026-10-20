import { CalendarClock, CheckCircle2, CircleHelp, Clock3, ShieldAlert, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LogSessionCta } from "../components/LogSessionCta";
import { SubjectRiskCard } from "../components/SubjectRiskCard";
import { Badge, EmptyState, ErrorState, PageHeader, RiskBadge, Section, Skeleton, Stat, StatStrip, Tabs } from "../components/ui";
import { useApp } from "../context/AppContext";
import { daysLabel, hours, longDate, shortDate } from "../lib/format";
import { canLogSessions } from "../lib/roles";
import type { Dashboard, SubjectRow } from "../lib/types";

const outcomeText: Record<string, string> = { COMPLETED: "Completed", IN_PROGRESS: "In progress", SKIPPED: "Skipped", MERGED: "Merged", CANCELLED: "Cancelled" };
const isDanger = (r: SubjectRow) => (r.status ? r.status === "DANGER" : r.risk === "critical");

function Schedule({ items, live }: { items: Dashboard["schedule"]; live: boolean }) {
  if (items.length === 0) return <EmptyState icon={CalendarClock} title="No classes scheduled today">{live ? "Nothing is planned in the timetable today, or today is a holiday / exam period." : "Timetables arrive in Phase 2."}</EmptyState>;
  return (
    <ol className="divide-y divide-line">
      {items.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0 sm:gap-5">
          <div className="w-[5.75rem] shrink-0 text-sm tabular-nums text-fg-subtle sm:w-28">{t.start}–{t.end}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg">{t.subject}</p>
            <p className="mt-0.5 truncate text-xs text-fg-subtle">{t.code} · Room {t.room}</p>
          </div>
          {t.state === "logged" && <Badge tone={t.outcome === "CANCELLED" ? "danger" : "good"}>{t.outcome ? outcomeText[t.outcome] ?? "Logged" : "Logged"}</Badge>}
          {t.state === "needs_log" && (live ? <Link to="/session-logs" className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-xs font-medium text-warn underline decoration-warn/40 underline-offset-4 hover:bg-warn-soft lg:min-h-8">Log pending</Link> : <Badge tone="warn">Log pending</Badge>)}
          {t.state === "upcoming" && <Badge>Upcoming</Badge>}
        </li>
      ))}
    </ol>
  );
}

type Filter = "all" | "danger" | "tight";

/** Subjects at risk: counts are derived from the rows, the filter only narrows what is shown. */
function AtRiskSection({ rows, live, state }: { rows: Dashboard["atRisk"]; live: boolean; state?: Dashboard["state"] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(() => ({ danger: rows.filter(isDanger).length, tight: rows.filter((r) => !isDanger(r)).length }), [rows]);
  const shown = rows.filter((r) => (filter === "all" ? true : filter === "danger" ? isDanger(r) : !isDanger(r)));
  const tightLabel = live ? "Tight" : "At risk";

  return (
    <Section title="Subjects at risk" description={rows.length === 0 ? undefined : "Most urgent first. Open a subject to see exactly why it has this status."}
      action={rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Summary">
          <Badge tone="danger">{counts.danger} {live ? "Danger" : "Critical"}</Badge>
          <Badge tone="warn">{counts.tight} {tightLabel}</Badge>
        </div>
      )}>
      {rows.length === 0 ? (
        state && state.unassessed > 0
          ? <EmptyState icon={CircleHelp} title={`No subjects at risk — but ${state.unassessed} of ${state.subjects} can't be assessed`}>{state.assessed} subject(s) were assessed and none is tight or in danger. The rest have no syllabus hours or no deadline yet, so nothing can be said about them. Add syllabus topics under Subjects.</EmptyState>
          : <EmptyState icon={CheckCircle2} title="No subjects at risk">{live ? (state ? `All ${state.assessed} subject(s) have enough teaching time left for their remaining syllabus.` : "Every subject has enough teaching time left for its remaining syllabus.") : "Every subject is within 10 points of its planned coverage."}</EmptyState>
      ) : (
        <div className="space-y-4">
          <Tabs label="Filter subjects by severity" value={filter} onChange={setFilter}
            tabs={[{ id: "all", label: `All (${rows.length})` }, { id: "danger", label: `${live ? "Danger" : "Critical"} (${counts.danger})` }, { id: "tight", label: `${tightLabel} (${counts.tight})` }]} />
          {shown.length === 0 ? <p className="py-6 text-center text-sm text-fg-subtle">No subjects match this filter.</p> : (
            <ul className="grid gap-4 xl:grid-cols-2">
              {shown.map((r) => (
                <li key={r.id} className="min-w-0"><SubjectRiskCard row={r} live={live} /></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  );
}

function Exams({ rows }: { rows: Dashboard["exams"] }) {
  if (rows.length === 0) return <EmptyState icon={CalendarClock} title="No upcoming exams" />;
  return (
    <ul className="divide-y divide-line">
      {rows.slice(0, 5).map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{e.name}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">{shortDate(e.examDate)} · {daysLabel(e.daysToExam ?? 0)}{e.subtitle ? ` · ${e.subtitle}` : ""}</p>
          </div>
          {e.risk && <Badge tone={e.risk === "on_track" ? "good" : e.risk === "at_risk" ? "warn" : "danger"}>{e.risk === "on_track" ? "Ready" : "Not ready"}</Badge>}
        </li>
      ))}
    </ul>
  );
}

function Recent({ rows }: { rows: Dashboard["recentSessions"] }) {
  if (rows.length === 0) return <EmptyState icon={Clock3} title="No sessions logged yet" />;
  return (
    <ul className="space-y-4">
      {rows.slice(0, 5).map((s) => (
        <li key={s.id} className="text-sm">
          <p className="font-medium text-fg">{s.subject} <span className="font-normal text-fg-subtle">· {hours(s.hours)}</span></p>
          <p className="mt-0.5 leading-relaxed text-fg-muted">{s.topics}</p>
          <p className="mt-0.5 text-xs text-fg-subtle">{s.code} · {s.faculty} · {shortDate(s.date)}</p>
        </li>
      ))}
    </ul>
  );
}

function StateNotice({ state }: { state: NonNullable<Dashboard["state"]> }) {
  const title = state.kind === "no_active_semester" ? "No active semester" : state.kind === "no_subjects" ? "No subjects configured" : "Nothing can be assessed yet";
  return (
    <section role="status" aria-label={title} className="flex items-start gap-3 rounded-card border border-warn/40 bg-warn-soft p-4 text-warn">
      <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-sm">{state.message}</p><p className="mt-1 text-xs opacity-90">This is not an all-clear: the real academic state cannot be determined from the data that exists.</p></div>
    </section>
  );
}

function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-24" />
      <Skeleton className="h-96" />
      <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" /></div>
    </div>
  );
}

export function Overview() {
  const { dashboard, reload, role } = useApp();

  return (
    <div className="space-y-8">
      <PageHeader title="Overview" subtitle={dashboard.status === "ready" ? `${longDate(dashboard.data.context.today)} · ${dashboard.data.context.campus.name}` : "Syllabus delivery across your campus"}
        actions={canLogSessions(role) && <span className="hidden lg:inline-flex"><LogSessionCta /></span>} />

      {dashboard.status === "loading" && <Loading />}
      {dashboard.status === "error" && <ErrorState message={dashboard.message} onRetry={reload} />}
      {dashboard.status === "ready" && (() => {
        const d = dashboard.data;
        const live = d.dataSource === "live";
        return (
          <>
            {live && d.state && d.state.kind !== "ready" ? null : live ? (
                <div className="surface backdrop-blur-md flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-fg-muted">
                    <span className="font-semibold text-fg">Overall status</span> <RiskBadge status={d.overall?.status ?? null} />
                    {d.overall?.worstSubject && d.overall.status !== "COMPLETE" && <span>decided by the worst subject: <Link className="-my-2.5 inline-block py-2.5 font-semibold text-accent-text underline underline-offset-2 hover:text-fg" to={`/subjects/${d.overall.worstSubject.id}`}>{d.overall.worstSubject.name}</Link> ({d.overall.worstSubject.batchName})</span>}
                  </div>
                  {d.overall && d.overall.byTrack.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
                      {d.overall.byTrack.map((t) => (
                        <span key={t.track} className="rounded-full bg-surface-3 px-2 py-0.5 font-medium text-fg-2">
                          {t.track === "MIRAI" ? "Mirai" : "University"}: {t.status.replace("_", " ").toLowerCase()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-fg-subtle"><ShieldAlert className="size-4 text-warn" aria-hidden /> No academic setup exists for this campus yet, so this page shows a built-in demonstration dataset, not a database.</p>
            )}

            {d.state && d.state.kind !== "ready" ? (
              <StateNotice state={d.state} />
            ) : (<>
            {d.state && d.state.unassessed > 0 && <p role="status" className="flex items-start gap-2 text-sm text-warn"><CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden /> {d.state.message}</p>}
            <StatStrip label="Key metrics">
              <Stat label="Syllabus covered" value={`${d.metrics.overallCoveragePct}%`} hint="Covered vs total planned hours" />
              <Stat label="Hours behind" value={hours(d.metrics.hoursBehind)} hint="Taught vs where the plan says we should be" />
              <Stat label={live ? "Subjects needing attention" : "Subjects at risk"} value={String(d.metrics.subjectsAtRisk)} hint={live ? "Running tight or behind" : `of ${d.atRisk.length + d.exams.filter((e) => e.risk === "on_track").length} this semester`} />
              <Stat label="Next exam" value={d.metrics.nextExamInDays === null ? "—" : daysLabel(d.metrics.nextExamInDays)} hint={d.exams[0] ? d.exams[0].name : "None scheduled"} />
            </StatStrip>

            <AtRiskSection rows={d.atRisk} live={live} state={d.state} />
            </>)}

            <div className="grid items-start gap-x-10 gap-y-8 lg:grid-cols-3">
              <Section className="min-w-0 lg:col-span-2" title="Today's schedule" description="Planned for this campus today, with log status"><Schedule items={d.schedule} live={live} /></Section>
              <div className="min-w-0 space-y-8">
                <Section title="Upcoming exams"><Exams rows={d.exams} /></Section>
                <Section title="Recent sessions"><Recent rows={d.recentSessions} /></Section>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
