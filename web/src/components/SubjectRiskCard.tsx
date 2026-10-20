import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { shortDate } from "../lib/format";
import type { RiskLevel, SubjectRow } from "../lib/types";
import { Badge, Disclosure, Progress, RiskBadge, cx } from "./ui";

const hoursText = (n: number) => `${Number(n.toFixed(2))} h`; // up to two decimals, trailing zeros trimmed
const legacy: Record<RiskLevel, { tone: "good" | "warn" | "danger"; label: string }> = {
  on_track: { tone: "good", label: "On track" }, at_risk: { tone: "warn", label: "At risk" }, critical: { tone: "danger", label: "Critical" },
};

/** One subject, laid out for scanning: identity + status, a four-number strip, the progress bar, one plain sentence, and the full reason on demand. */
export function SubjectRiskCard({ row, live }: { row: SubjectRow; live: boolean }) {
  const severe = row.risk === "critical";
  const meta = [row.code, row.batchName, row.track, row.faculty].filter(Boolean) as string[];
  const sentence = live && row.availableHours != null && row.remainingHours != null
    ? `${hoursText(row.availableHours)} of teaching remain for ${hoursText(row.remainingHours)} of syllabus${row.deadline ? `, before ${shortDate(row.deadline)}` : ""}.`
    : `${hoursText(row.hoursBehind)} behind plan${row.daysToExam != null ? ` with ${row.daysToExam} days to the exam` : ""}.`;

  return (
    <article className={cx("lift cv-auto group relative flex min-w-0 flex-col gap-4 rounded-card border border-line bg-surface/70 p-4 pl-5 before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full",
      severe ? "before:bg-danger" : "before:bg-warn")}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[0.9375rem] font-medium leading-snug text-fg [overflow-wrap:anywhere]">
            {live
              ? <Link to={`/subjects/${row.id}`} className="-my-2.5 inline-block py-2.5 outline-offset-4 after:absolute after:inset-0 after:rounded-card after:content-[''] hover:text-accent-text">{row.name}</Link>
              : row.name}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-fg-subtle">{meta.join(" · ")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {row.status ? <RiskBadge status={row.status} /> : <Badge tone={legacy[row.risk].tone}>{legacy[row.risk].label}</Badge>}
          {live && <ArrowUpRight aria-hidden className="size-4 text-fg-faint transition-colors group-hover:text-accent-text" />}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <div><dt className="text-xs text-fg-subtle">Coverage</dt><dd className="mt-0.5 text-base font-semibold tabular-nums text-fg">{row.coveragePct}%</dd></div>
        <div><dt className="whitespace-nowrap text-xs text-fg-subtle">Should be at</dt><dd className="mt-0.5 text-base font-semibold tabular-nums text-fg">{row.expectedPct}%</dd></div>
        <div><dt className="text-xs text-fg-subtle">Behind plan</dt><dd className="mt-0.5 text-base font-semibold tabular-nums text-fg">{hoursText(row.hoursBehind)}</dd></div>
        <div>
          <dt className="text-xs text-fg-subtle">Time cushion</dt>
          <dd className={cx("mt-0.5 text-base font-semibold tabular-nums", row.bufferRatio == null ? "text-fg-faint" : severe ? "text-danger" : "text-warn")}>{row.bufferRatio == null ? "—" : row.bufferRatio.toFixed(2)}</dd>
        </div>
      </dl>

      <Progress value={row.coveragePct} expected={row.expectedPct} label={`${row.name} syllabus coverage`} />

      <div className="space-y-1">
        <p className="text-sm leading-relaxed text-fg-muted">{sentence}</p>
        {row.reason && <Disclosure summary="Why this status">{<p className="text-xs leading-relaxed text-fg-subtle">{row.reason}</p>}</Disclosure>}
      </div>
    </article>
  );
}
