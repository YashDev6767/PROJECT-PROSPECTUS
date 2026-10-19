import { CalendarX2, GraduationCap, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, ButtonLink, EmptyState, PageHeader, Progress, RiskBadge, SampleBadge, Section, tableClasses } from "../components/ui";
import { Boundary, useResource } from "../components/ui/Resource";
import { useApp } from "../context/AppContext";
import { daysLabel, dateRange, shortDate } from "../lib/format";
import { campusName, trackLabels } from "../lib/labels";
import type { ExamReadinessExam, ExamReadinessResponse, ExamReadinessSubject } from "../lib/types";

const h = (n: number | null) => (n === null ? "—" : `${Number(n.toFixed(2))} h`);

function SubjectRow({ s, exam }: { s: ExamReadinessSubject; exam: ExamReadinessExam }) {
  const unassessed = s.status === "UNKNOWN";
  return (
    <tr>
      <td className={`${tableClasses.td} min-w-[14rem]`}>
        <Link to={`/subjects/${s.subjectId}`} className="-my-3 inline-block py-3 font-medium text-fg hover:text-accent-text">{s.name}</Link> {s.isSample && <SampleBadge />}
        <p className="text-xs text-fg-subtle">{s.code} · {s.batchName}{s.facultyName ? ` · ${s.facultyName}` : " · No faculty"}</p>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-fg-muted">{s.headline}</p>
      </td>
      <td className={tableClasses.td}><RiskBadge status={s.status} /></td>
      <td className={`${tableClasses.td} min-w-[9rem]`}>
        {unassessed ? <span className="text-fg-faint">—</span> : (<>
          <span className="tabular-nums text-fg">{s.coveragePct ?? 0}%</span>
          <div className="mt-1.5"><Progress value={s.coveragePct ?? 0} label={`${s.name} syllabus coverage for ${exam.name}`} /></div>
        </>)}
      </td>
      <td className={`${tableClasses.td} tabular-nums`}>{unassessed ? "—" : h(s.remainingHours)}</td>
      <td className={`${tableClasses.td} tabular-nums`}>{unassessed ? "—" : h(s.availableHours)}</td>
      <td className={`${tableClasses.td} tabular-nums`}>{s.bufferRatio === null ? "—" : s.bufferRatio.toFixed(2)}</td>
      <td className={`${tableClasses.td} text-xs text-fg-subtle`}>
        {s.scopeMode === "whole_syllabus" ? "Whole syllabus" : `${s.topicsInScope} topic(s) assessed by this exam`}
        {s.unscopedTopics > 0 && <span className="block text-warn">{s.unscopedTopics} topic(s) have no exam tag and are not counted</span>}
      </td>
    </tr>
  );
}

function ExamBlock({ exam }: { exam: ExamReadinessExam }) {
  const when = exam.phase === "in_progress" ? "Under way — teaching has ended" : `${daysLabel(exam.daysToStart)} · classes end ${shortDate(exam.lastTeachingDate)}`;
  return (
    <Section title={exam.name} description={`${dateRange(exam.startsOn, exam.endsOn)} · ${when}`}
      action={<div className="flex flex-wrap items-center gap-2">{exam.isSample && <SampleBadge />}<Badge>{trackLabels[exam.semester.track]}</Badge>{exam.status ? <RiskBadge status={exam.status} /> : <Badge tone="neutral">No subjects</Badge>}</div>}>
      <p className="mb-3 text-xs text-fg-subtle">{exam.semester.name} · {exam.batch ? `Batch ${exam.batch.name}` : "whole cohort"} · {exam.typeLabel}{exam.notes ? ` · ${exam.notes}` : ""}</p>
      {exam.note && <p role="status" className="mb-3 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm text-warn"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {exam.note} This exam is configured, but its readiness is not fully known.</p>}
      {exam.subjects.length > 0 && (
        <div className={tableClasses.wrap}>
          <table className={`${tableClasses.table} min-w-[52rem]`}>
            <caption className="sr-only">Readiness of each subject for {exam.name}</caption>
            <thead><tr>{["Subject", "Status", "Coverage", "Syllabus left", "Teaching left", "Buffer", "Counts"].map((c) => <th key={c} scope="col" className={tableClasses.th}>{c}</th>)}</tr></thead>
            <tbody>{exam.subjects.map((s) => <SubjectRow key={s.subjectId} s={s} exam={exam} />)}</tbody>
          </table>
        </div>)}
    </Section>
  );
}

export function ExamReadiness() {
  const { campusId } = useApp();
  const res = useResource<ExamReadinessResponse>(campusId ? `/api/exam-readiness?campusId=${campusId}` : null);
  return (
    <div className="space-y-8">
      <PageHeader title="Exam Readiness" subtitle={`${campusName(campusId)} · remaining syllabus against the teaching time left before each exam`}
        actions={<ButtonLink to="/exams">Exam schedule</ButtonLink>} />
      <p className="max-w-3xl text-sm text-fg-muted">
        Readiness compares the syllabus hours still to cover with the scheduled teaching hours left before the exam starts (holidays, exam weeks and cancelled classes respected).
        It is a capacity check, not a prediction of marks, and it never invents a score.
      </p>
      <Boundary res={res} lines={3}>{(d) => d.state === "no_active_semester" ? (
        <section role="status" className="flex items-start gap-3 rounded-card border border-warn/40 bg-warn-soft p-4 text-warn">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><h2 className="text-base font-semibold">No active semester</h2><p className="mt-1 text-sm">{d.message}</p></div>
        </section>
      ) : d.state === "no_exams" ? (
        <EmptyState icon={CalendarX2} title="No upcoming exams configured">{d.message}</EmptyState>
      ) : (
        <div className="space-y-10">{d.exams.map((e) => <ExamBlock key={e.id} exam={e} />)}</div>
      )}</Boundary>
      {res.data?.state === "ready" && res.data.exams.length === 0 && <EmptyState icon={GraduationCap} title="Nothing to show" />}
    </div>
  );
}
