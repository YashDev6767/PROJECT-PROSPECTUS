import { CalendarClock, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LogSessionCta } from "../components/LogSessionCta";
import { SubjectRiskCard } from "../components/SubjectRiskCard";
import { Badge, Card, EmptyState, ErrorState, PageHeader, RiskBadge, Skeleton, StatTile, Tabs } from "../components/ui";
import { BlurFade } from "../components/vendor/magicui/blur-fade";
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
        <li key={t.id} className="flex items-center gap-5 py-3.5 first:pt-0 last:pb-0">
          <div className="w-28 shrink-0 text-sm tabular-nums text-fg-subtle">{t.start}–{t.end}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{t.subject}</p>
            <p className="mt-0.5 truncate text-xs text-fg-subtle">{t.code} · Room {t.room}</p>
          </div>
          {t.state === "logged" && <Badge tone={t.outcome === "CANCELLED" ? "danger" : "good"}>{t.outcome ? outcomeText[t.outcome] ?? "Logged" : "Logged"}</Badge>}
          {t.state === "needs_log" && (live ? <Link to="/session-logs" className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn underline-offset-2 hover:underline">Log pending</Link> : <Badge tone="warn">Log pending</Badge>)}
          {t.state === "upcoming" && <Badge>Upcoming</Badge>}
        </li>
      ))}
    </ol>
  );
}

type Filter = "all" | "danger" | "tight";

/** Subjects at risk: counts are derived from the rows, the filter only narrows what is shown. */
function AtRiskSection({ rows, live }: { rows: Dashboard["atRisk"]; live: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(() => ({ danger: rows.filter(isDanger).length, tight: rows.filter((r) => !isDanger(r)).length }), [rows]);
  const shown = rows.filter((r) => (filter === "all" ? true : filter === "danger" ? isDanger(r) : !isDanger(r)));
  const tightLabel = live ? "Tight" : "At risk";

  return (
    <Card title="Subjects at risk" description={rows.length === 0 ? undefined : "Most urgent first. Open a subject to see exactly why it has this status."}
      action={rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Summary">
          <Badge tone="danger">{counts.danger} {live ? "Danger" : "Critical"}</Badge>
          <Badge tone="warn">{counts.tight} {tightLabel}</Badge>
        </div>
      )}>
      {rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No subjects at risk">{live ? "Every subject has enough teaching time left for its remaining syllabus." : "Every subject is within 10 points of its planned coverage."}</EmptyState>
      ) : (
        <div className="space-y-5">
          <Tabs label="Filter subjects by severity" value={filter} onChange={setFilter}
            tabs={[{ id: "all", label: `All (${rows.length})` }, { id: "danger", label: `${live ? "Danger" : "Critical"} (${counts.danger})` }, { id: "tight", label: `${tightLabel} (${counts.tight})` }]} />
          {shown.length === 0 ? <p className="py-6 text-center text-sm text-fg-subtle">No subjects match this filter.</p> : (
            <ul className="grid gap-4 xl:grid-cols-2">
              {shown.map((r, i) => (
                <li key={r.id} className="min-w-0"><BlurFade delay={Math.min(i, 8) * 0.05} direction="up" offset={10}><SubjectRiskCard row={r} live={live} /></BlurFade></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function Exams({ rows }: { rows: Dashboard["exams"] }) {
  if (rows.length === 0) return <EmptyState icon={CalendarClock} title="No upcoming exams" />;
  return (
    <ul className="divide-y divide-line">
      {rows.slice(0, 5).map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fg">{e.name}</p>
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
          <p className="font-semibold text-fg">{s.subject} <span className="font-normal text-fg-subtle">· {hours(s.hours)}</span></p>
          <p className="mt-0.5 leading-relaxed text-fg-muted">{s.topics}</p>
          <p className="mt-0.5 text-xs text-fg-subtle">{s.code} · {s.faculty} · {shortDate(s.date)}</p>
        </li>
      ))}
    </ul>
  );
}

function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
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
            {live ? (
              <BlurFade delay={0.05}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-fg-muted">
                  <span className="font-semibold text-fg">Overall status</span> <RiskBadge status={d.overall?.status ?? null} />
                  {d.overall?.worstSubject && d.overall.status !== "COMPLETE" && <span>decided by the worst subject: <Link className="font-semibold text-accent-text underline underline-offset-2" to={`/subjects/${d.overall.worstSubject.id}`}>{d.overall.worstSubject.name}</Link> ({d.overall.worstSubject.batchName})</span>}
                  {d.overall && d.overall.byTrack.length > 1 && <span className="text-xs text-fg-subtle">· {d.overall.byTrack.map((t) => `${t.track === "MIRAI" ? "Mirai" : "University"}: ${t.status.replace("_", " ").toLowerCase()}`).join(" · ")}</span>}
                </div>
              </BlurFade>
            ) : (
              <p className="flex items-center gap-2 text-sm text-fg-subtle"><ShieldAlert className="size-4 text-warn" aria-hidden /> No academic setup exists for this campus yet, so this page shows a built-in demonstration dataset, not a database.</p>
            )}

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" role="list" aria-label="Key metrics">
              <BlurFade delay={0.08} direction="up"><StatTile label="Syllabus covered" value={`${d.metrics.overallCoveragePct}%`} numeric={{ value: d.metrics.overallCoveragePct, decimals: 1, suffix: "%" }} hint="Covered vs total planned hours" /></BlurFade>
              <BlurFade delay={0.13} direction="up"><StatTile label="Hours behind plan" value={hours(d.metrics.hoursBehind)} numeric={{ value: d.metrics.hoursBehind, decimals: Number.isInteger(d.metrics.hoursBehind) ? 0 : 1, suffix: " h" }} hint="Across all subjects" /></BlurFade>
              <BlurFade delay={0.18} direction="up"><StatTile label={live ? "Subjects tight or in danger" : "Subjects at risk"} value={String(d.metrics.subjectsAtRisk)} numeric={{ value: d.metrics.subjectsAtRisk }} hint={live ? "Buffer below 1.15" : `of ${d.atRisk.length + d.exams.filter((e) => e.risk === "on_track").length} this semester`} /></BlurFade>
              <BlurFade delay={0.23} direction="up"><StatTile label="Next exam" value={d.metrics.nextExamInDays === null ? "—" : daysLabel(d.metrics.nextExamInDays)} hint={d.exams[0] ? d.exams[0].name : "None scheduled"} /></BlurFade>
            </div>

            <BlurFade delay={0.28} direction="up"><AtRiskSection rows={d.atRisk} live={live} /></BlurFade>

            <div className="grid items-start gap-6 lg:grid-cols-3">
              <BlurFade className="lg:col-span-2" delay={0.33} direction="up"><Card title="Today's schedule" description="Classes planned for this campus today, with their log status"><Schedule items={d.schedule} live={live} /></Card></BlurFade>
              <div className="space-y-6">
                <BlurFade delay={0.38} direction="up"><Card title="Upcoming exams"><Exams rows={d.exams} /></Card></BlurFade>
                <BlurFade delay={0.43} direction="up"><Card title="Recent sessions"><Recent rows={d.recentSessions} /></Card></BlurFade>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
