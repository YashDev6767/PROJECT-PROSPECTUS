import { CalendarClock, GraduationCap, UserRoundX } from "lucide-react";
import { Badge, Disclosure, EmptyState, ErrorState, PageHeader, Progress, Section, Skeleton, Stat, StatStrip } from "../components/ui";
import { Field, Select } from "../components/ui/forms";
import { useResource } from "../components/ui/Resource";
import { useApp } from "../context/AppContext";
import { ApiError } from "../lib/api";
import { daysLabel, hours, shortDate } from "../lib/format";
import { campusName, trackLabels } from "../lib/labels";
import type { Batch, StudentExam, StudentPortalData, StudentStatus, StudentSubject } from "../lib/types";

const tone = (s: StudentStatus) => (s.key === "needs_attention" ? "danger" : s.key === "keep_an_eye" ? "warn" : s.key === "no_data" ? "neutral" : "good") as "danger" | "warn" | "neutral" | "good";
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const day = (iso: string) => `${weekday.format(new Date(`${iso}T00:00:00Z`))} ${shortDate(iso)}`;

function SubjectRow({ s }: { s: StudentSubject }) {
  return (
    <li className="py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[0.9375rem] font-medium text-fg">{s.name} <span className="text-sm font-normal text-fg-subtle">{s.code}</span></h3>
        <Badge tone={tone(s.status)}>{s.status.label}</Badge>
      </div>
      {s.coveragePct === null ? (
        <p className="mt-2 text-sm text-fg-subtle">The syllabus for this subject has not been added yet, so progress cannot be shown.</p>
      ) : (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-sm"><span className="font-medium tabular-nums text-fg">{s.coveragePct}% covered</span><span className="tabular-nums text-fg-subtle">{hours(s.coveredHours)} of {hours(s.hoursInScope)} · {hours(s.remainingHours)} to go</span></div>
          <div className="mt-1.5"><Progress value={s.coveragePct} label={`${s.name} syllabus covered`} /></div>
        </div>)}
      {(s.coveredTopics.length > 0 || s.upcomingTopics.length > 0) && (
        <Disclosure summary="Topics" className="mt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs font-medium text-fg-subtle">Covered so far</p>
              {s.coveredTopics.length === 0 ? <p className="mt-1 text-sm text-fg-subtle">Nothing yet.</p> : <ul className="mt-1 space-y-1 text-sm text-fg-2">{s.coveredTopics.map((t) => <li key={`${t.unitTitle}-${t.title}`}>{t.title}{t.completionPct < 100 && <span className="text-fg-subtle"> · {t.completionPct}% done</span>}</li>)}</ul>}</div>
            <div><p className="text-xs font-medium text-fg-subtle">Coming up</p>
              {s.upcomingTopics.length === 0 ? <p className="mt-1 text-sm text-fg-subtle">Everything planned is covered.</p> : <ul className="mt-1 space-y-1 text-sm text-fg-2">{s.upcomingTopics.map((t) => <li key={`${t.unitTitle}-${t.title}`}>{t.title}{t.expectedBy && <span className="text-fg-subtle"> · around {shortDate(t.expectedBy)}</span>}</li>)}</ul>}</div>
          </div>
        </Disclosure>)}
    </li>
  );
}

function ExamBlock({ e }: { e: StudentExam }) {
  return (
    <li className="py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-[0.9375rem] font-medium text-fg">{e.name} <span className="text-sm font-normal text-fg-subtle">{e.typeLabel}</span></h3>
        <p className="text-sm text-fg-subtle">{e.startsOn === e.endsOn ? shortDate(e.startsOn) : `${shortDate(e.startsOn)} – ${shortDate(e.endsOn)}`} · {e.phase === "in_progress" ? "under way" : daysLabel(e.daysToStart)}</p>
      </div>
      {e.phase === "upcoming" && <p className="mt-0.5 text-xs text-fg-subtle">Classes before it run until {shortDate(e.classesEnd)}.</p>}
      <ul className="mt-3 space-y-3">
        {e.subjects.map((s) => (
          <li key={s.code} className="text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="font-medium text-fg-2">{s.name}</span><Badge tone={tone(s.status)}>{s.status.label}</Badge></div>
            <p className="mt-0.5 text-xs text-fg-subtle">
              {s.coveragePct === null ? "No syllabus hours to measure yet." : `${s.coveragePct}% of what this exam covers is done · ${hours(s.remainingHours)} to go${s.teachingHoursLeft !== null ? ` · ${hours(s.teachingHoursLeft)} of classes left before it` : ""}`}
            </p>
            <p className="mt-0.5 text-xs text-fg-subtle">{s.scope}</p>
            {s.scopeTopics.length > 0 && (
              <Disclosure summary={`Topics (${s.scopeTopics.length})`}>
                <ul className="space-y-1 text-sm text-fg-2">{s.scopeTopics.map((t) => <li key={`${t.unitTitle}-${t.title}`}>{t.title} <span className="text-fg-subtle">· {t.completionPct === 100 ? "covered" : t.completionPct > 0 ? `${t.completionPct}% done` : "not yet covered"}</span></li>)}</ul>
              </Disclosure>)}
          </li>))}
      </ul>
    </li>
  );
}

/** Read-only learning view for the student's own batch. All figures come from the API (the same engine as the dashboard). */
export function StudentPortal() {
  const { auth, batchId, setBatchId, campusId } = useApp();
  const demo = !auth.user; // development demo mode: no signed-in student, so the batch is previewed by choice
  const batches = useResource<{ batches: Batch[] }>(demo && campusId ? `/api/batches?campusId=${campusId}` : null);
  const res = useResource<StudentPortalData>(batchId || !demo ? "/api/student/portal" : null);

  const picker = demo && (
    <div className="max-w-sm">
      <Field label="Preview as a student of batch" hint="Development demo only. A signed-in student is linked to one batch by the administrator and cannot change it.">
        <Select value={batchId ?? ""} onChange={(e) => setBatchId(e.target.value || null)}>
          <option value="">Choose a batch…</option>
          {batches.data?.batches.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.semesterName}</option>)}
        </Select>
      </Field>
    </div>
  );

  if (demo && !batchId) return <div className="space-y-8"><PageHeader title="My learning" subtitle="Your subjects, progress, coming classes and exams" />{picker}<EmptyState icon={GraduationCap} title="Choose a batch to preview">The student view shows one batch at a time.</EmptyState></div>;
  if (res.error && !res.data) {
    const noBatch = res.error instanceof ApiError && res.error.code === "no_batch_assigned";
    return (
      <div className="space-y-8"><PageHeader title="My learning" subtitle="Your subjects, progress, coming classes and exams" />{picker}
        {noBatch ? <EmptyState icon={UserRoundX} title="Your account isn't linked to a batch yet">Ask the administrator to link your account to your batch. Until then there is nothing to show.</EmptyState>
          : <ErrorState title="Couldn't load your learning page" message={res.error.message} onRetry={res.reload} />}
      </div>);
  }
  if (!res.data) return <div className="space-y-8" aria-busy="true" aria-label="Loading"><PageHeader title="My learning" subtitle="Your subjects, progress, coming classes and exams" />{picker}<Skeleton className="h-24" /><Skeleton className="h-64" /></div>;

  const d = res.data;
  return (
    <div className="space-y-10">
      <PageHeader title="My learning" subtitle={`${d.batch.name} · ${campusName(d.campusId)} · ${trackLabels[d.track]} · ${d.semester.name}`} />
      {picker}

      {d.overview.subjectCount === 0 ? (
        <EmptyState icon={GraduationCap} title="No subjects yet">Subjects for your batch haven't been set up, so there is no progress to show.</EmptyState>
      ) : (
        <>
          <StatStrip label="Overview">
            <Stat label="Syllabus covered" value={d.overview.overallCoveragePct === null ? "—" : `${d.overview.overallCoveragePct}%`} hint={d.overview.overallCoveragePct === null ? "No syllabus added yet" : `${hours(d.overview.coveredHours)} of ${hours(d.overview.hoursInScope)} across your subjects`} />
            <Stat label="Subjects" value={String(d.overview.subjectCount)} hint={`This semester`} />
            <Stat label="Need attention" value={String(d.overview.needAttention)} hint={d.overview.needAttention === 0 ? "None right now" : "Behind where they should be"} />
            <Stat label="Next exam" value={d.exams[0] ? (d.exams[0].phase === "in_progress" ? "Under way" : daysLabel(d.exams[0].daysToStart)) : "—"} hint={d.exams[0] ? d.exams[0].name : "None scheduled"} />
          </StatStrip>

          <Section title="My subjects" description="How much of each syllabus has been taught">
            <ul className="divide-y divide-line">{d.subjects.map((s) => <SubjectRow key={s.id} s={s} />)}</ul>
          </Section>
        </>)}

      <div className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-2">
        <Section title="Coming up" description="Classes planned in the next two weeks">
          {d.upcomingClasses.length === 0 ? <EmptyState icon={CalendarClock} title="No classes planned in the next two weeks">Check the timetable and academic calendar for holidays and exam weeks.</EmptyState> : (
            <ol className="divide-y divide-line">{d.upcomingClasses.map((c) => (
              <li key={`${c.date}-${c.startTime}-${c.subjectCode}`} className="flex items-baseline gap-4 py-2.5 first:pt-0 last:pb-0">
                <span className="w-24 shrink-0 text-sm tabular-nums text-fg-subtle">{day(c.date)}</span>
                <span className="min-w-0 flex-1 text-sm text-fg-2"><span className="font-medium text-fg">{c.subjectName}</span><br /><span className="text-xs text-fg-subtle">{c.startTime}–{c.endTime}{c.room ? ` · ${c.room}` : ""}{c.kind === "makeup" ? " · make-up class" : ""}</span></span>
              </li>))}</ol>)}
        </Section>

        <Section title="Upcoming exams" description="Dates, what they cover and how you stand">
          {d.exams.length === 0 ? <EmptyState icon={GraduationCap} title="No exams scheduled yet">When your exams are added, their dates and the topics they cover will appear here.</EmptyState> : <ul className="divide-y divide-line">{d.exams.map((e) => <ExamBlock key={e.id} e={e} />)}</ul>}
        </Section>
      </div>
    </div>
  );
}
