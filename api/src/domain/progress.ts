/**
 * Syllabus progression and risk (pure). Everything is measured in planned teaching HOURS, never topic counts.
 *
 *   hours in scope  = Σ planned hours of topics that are not marked Skipped
 *   covered hours   = Σ planned hours × completion%  (completed topics count 100%, in-progress topics their percentage)
 *   remaining hours = max(0, in scope − covered)
 *   coverage %      = covered / in scope × 100
 *   available hours = Σ hours of still-unlogged planned sessions from the reference date through the last teaching day
 *   buffer ratio    = available / remaining            (rounded to 2 dp BEFORE classifying, so what you see is what is classified)
 *   pace vs plan    = covered − min(in scope, planned hours of sessions dated before the reference date)
 *
 * Risk: COMPLETE (remaining 0) · ON_TRACK (ratio ≥ onTrack) · TIGHT (≥ tight) · DANGER (< tight) · UNKNOWN (no hours in scope or no deadline).
 * Low progress alone never means DANGER: only the buffer between capacity and remaining work does.
 */
import type { ISODate } from "./dates.js";
import { sortOccurrences, type Occurrence } from "./schedule.js";

export type RiskStatus = "ON_TRACK" | "TIGHT" | "DANGER" | "COMPLETE" | "UNKNOWN";
export interface Thresholds { onTrack: number; tight: number }
export const DEFAULT_THRESHOLDS: Thresholds = { onTrack: 1.15, tight: 1.0 };

const EPS = 1e-9;
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n: number) => String(round2(n));

/* ---------- topic state: latest entry wins, so repeated or merged logs can never double count ---------- */
export interface TopicEntryInput { topicId: string; kind: "COVERED" | "LEFTOVER" | "SKIPPED"; completionPct: number; heldOn: ISODate; seq: number }
export interface TopicState { kind: "covered" | "skipped"; pct: number }

export function resolveTopicStates(entries: TopicEntryInput[]): Map<string, TopicState> {
  const latest = new Map<string, TopicEntryInput>();
  for (const e of entries) {
    if (e.kind === "LEFTOVER") continue; // informational only
    const cur = latest.get(e.topicId);
    if (!cur || e.heldOn > cur.heldOn || (e.heldOn === cur.heldOn && e.seq > cur.seq)) latest.set(e.topicId, e);
  }
  return new Map([...latest].map(([id, e]) => [id, e.kind === "SKIPPED" ? { kind: "skipped", pct: 0 } : { kind: "covered", pct: Math.min(100, Math.max(0, e.completionPct)) }]));
}

export interface TopicInput { id: string; title: string; unitTitle: string; plannedHours: number }
export interface TopicProgress {
  topicId: string; title: string; unitTitle: string; plannedHours: number;
  status: "skipped" | "not_started" | "in_progress" | "completed";
  completionPct: number; coveredHours: number; remainingHours: number;
  plannedStart: ISODate | null; plannedEnd: ISODate | null; // original plan (history)
  forecastEnd: ISODate | null; // where the remaining work lands on the schedule that is left
  overdue: boolean;
}

export function computeCoverage(topics: TopicInput[], states: Map<string, TopicState>) {
  let scope = 0, covered = 0;
  const rows = topics.map((t) => {
    const st = states.get(t.id);
    if (st?.kind === "skipped") return { t, status: "skipped" as const, pct: 0, covered: 0, remaining: 0 };
    const pct = st?.pct ?? 0;
    const c = (t.plannedHours * pct) / 100;
    scope += t.plannedHours; covered += c;
    return { t, status: pct >= 100 ? ("completed" as const) : pct > 0 ? ("in_progress" as const) : ("not_started" as const), pct, covered: c, remaining: t.plannedHours - c };
  });
  const remaining = Math.max(0, scope - covered);
  return { rows, scope, covered, remaining, coveragePct: scope > EPS ? (covered / scope) * 100 : null };
}

/** Lay items end to end over the occurrences' hours; returns the dates on which each item starts and finishes. */
export function allocate(items: Array<{ id: string; hours: number }>, occurrences: Occurrence[]): Map<string, { start: ISODate | null; end: ISODate | null }> {
  const occ = sortOccurrences(occurrences);
  const cum: number[] = [];
  let run = 0;
  for (const o of occ) { run += o.hours; cum.push(run); }
  const out = new Map<string, { start: ISODate | null; end: ISODate | null }>();
  let from = 0;
  for (const it of items) {
    if (it.hours <= EPS) { out.set(it.id, { start: null, end: null }); continue; }
    const to = from + it.hours;
    const si = cum.findIndex((c) => c > from + EPS);
    const ei = cum.findIndex((c) => c >= to - EPS);
    out.set(it.id, { start: si < 0 ? null : occ[si]!.date, end: ei < 0 ? null : occ[ei]!.date });
    from = to;
  }
  return out;
}

export interface ProgressInput {
  topics: TopicInput[];
  states: Map<string, TopicState>;
  baseline: Occurrence[]; // timetable sessions in the teaching window from semester start (past and future)
  makeups: Occurrence[]; // replacement sessions for rescheduled cancellations
  resolvedKeys: Set<string>; // occurrence keys that already have a log (any outcome)
  afterDeadline?: Occurrence[]; // sessions after the last teaching day — used only to project a late finish
  referenceDate: ISODate;
  deadlineLabel: string | null;
  lastTeachingDate: ISODate | null;
  thresholds?: Thresholds;
}

export interface SubjectProgress {
  risk: RiskStatus;
  headline: string;
  reasons: string[];
  hoursInScope: number; coveredHours: number; remainingHours: number; coveragePct: number | null;
  plannedToDateHours: number; paceHours: number;
  availableHours: number | null; bufferRatio: number | null;
  projectedCompletion: ISODate | null; projectionNote: string;
  overdueTopics: Array<{ topicId: string; title: string; plannedEnd: ISODate; completionPct: number }>;
  unloggedPastSessions: number; remainingSessions: number;
  topics: TopicProgress[];
  thresholds: Thresholds;
}

export function classify(remaining: number, available: number | null, scope: number, th: Thresholds): { risk: RiskStatus; ratio: number | null } {
  if (scope <= EPS) return { risk: "UNKNOWN", ratio: null };
  if (remaining <= EPS) return { risk: "COMPLETE", ratio: null };
  if (available === null) return { risk: "UNKNOWN", ratio: null };
  const rawRatio = available / remaining;
  const ratio = round2(rawRatio);
  return { risk: rawRatio >= th.onTrack ? "ON_TRACK" : rawRatio >= th.tight ? "TIGHT" : "DANGER", ratio };
}

export function evaluateProgress(input: ProgressInput): SubjectProgress {
  const th = input.thresholds ?? DEFAULT_THRESHOLDS;
  const ref = input.referenceDate;
  const cov = computeCoverage(input.topics, input.states);
  const baseline = sortOccurrences(input.baseline);

  const plannedToDate = Math.min(cov.scope, baseline.filter((o) => o.date < ref).reduce((n, o) => n + o.hours, 0));
  const pace = cov.covered - plannedToDate;
  const unlogged = baseline.filter((o) => o.date < ref && !input.resolvedKeys.has(o.key)).length;

  const last = input.lastTeachingDate;
  const unresolved = (o: Occurrence) => !input.resolvedKeys.has(o.key) && o.date >= ref;
  const future = sortOccurrences([...baseline, ...input.makeups].filter((o) => unresolved(o) && (last === null || o.date <= last)));
  const available = last === null ? null : future.reduce((n, o) => n + o.hours, 0);

  const { risk, ratio } = classify(cov.remaining, available, cov.scope, th);

  // projection of the finish date over the sessions that are left (optionally past the deadline)
  const projectionSessions = sortOccurrences([...future, ...(input.afterDeadline ?? []).filter(unresolved)]);
  let projected: ISODate | null = null;
  let projectionNote = "";
  if (cov.scope <= EPS) projectionNote = "No syllabus hours in scope.";
  else if (cov.remaining <= EPS) projectionNote = "Everything in scope is already covered.";
  else {
    let run = 0;
    for (const o of projectionSessions) { run += o.hours; if (run >= cov.remaining - EPS) { projected = o.date; break; } }
    projectionNote = projected ? "" : "The remaining hours do not fit into the sessions left in this semester.";
  }

  // original plan (history) vs forecast (what is left)
  const plan = allocate(cov.rows.filter((r) => r.status !== "skipped").map((r) => ({ id: r.t.id, hours: r.t.plannedHours })), baseline);
  const forecast = allocate(cov.rows.filter((r) => r.status !== "skipped").map((r) => ({ id: r.t.id, hours: r.remaining })), projectionSessions);

  const topics: TopicProgress[] = cov.rows.map((r) => {
    const p = plan.get(r.t.id);
    const overdue = r.status !== "skipped" && r.status !== "completed" && p?.end != null && p.end < ref;
    return {
      topicId: r.t.id, title: r.t.title, unitTitle: r.t.unitTitle, plannedHours: round2(r.t.plannedHours), status: r.status,
      completionPct: r.pct, coveredHours: round2(r.covered), remainingHours: round2(r.remaining),
      plannedStart: p?.start ?? null, plannedEnd: p?.end ?? null,
      forecastEnd: r.status === "completed" || r.status === "skipped" ? null : forecast.get(r.t.id)?.end ?? null, overdue,
    };
  });
  const overdueTopics = topics.filter((t) => t.overdue).map((t) => ({ topicId: t.topicId, title: t.title, plannedEnd: t.plannedEnd!, completionPct: t.completionPct }));

  const { headline, reasons } = explain({ risk, ratio, cov, available, pace, plannedToDate, projected, projectionNote, overdueTopics, unlogged, th, deadlineLabel: input.deadlineLabel, last });

  return {
    risk, headline, reasons,
    hoursInScope: round2(cov.scope), coveredHours: round2(cov.covered), remainingHours: round2(cov.remaining),
    coveragePct: cov.coveragePct === null ? null : round2(cov.coveragePct),
    plannedToDateHours: round2(plannedToDate), paceHours: round2(pace),
    availableHours: available === null ? null : round2(available), bufferRatio: ratio,
    projectedCompletion: projected, projectionNote, overdueTopics,
    unloggedPastSessions: unlogged, remainingSessions: future.length, topics, thresholds: th,
  };
}

function explain(a: {
  risk: RiskStatus; ratio: number | null; cov: ReturnType<typeof computeCoverage>; available: number | null; pace: number; plannedToDate: number;
  projected: ISODate | null; projectionNote: string; overdueTopics: Array<{ title: string }>; unlogged: number; th: Thresholds; deadlineLabel: string | null; last: ISODate | null;
}) {
  const reasons: string[] = [];
  const rem = fmt(a.cov.remaining), av = a.available === null ? null : fmt(a.available);
  let headline: string;
  switch (a.risk) {
    case "COMPLETE": headline = `All ${fmt(a.cov.scope)} h in scope are covered.`; break;
    case "UNKNOWN":
      headline = a.cov.scope <= EPS ? "No syllabus hours in scope, so progress cannot be measured." : "No deadline is known, so the remaining capacity cannot be measured.";
      reasons.push(a.cov.scope <= EPS ? "Add syllabus topics with planned hours (or un-skip topics) for this subject." : "Schedule the end-term exam or set the semester dates."); break;
    case "ON_TRACK": headline = `Enough time: ${av} h of teaching left for ${rem} h of syllabus (buffer ${a.ratio?.toFixed(2)}, at least ${a.th.onTrack.toFixed(2)} needed for On track).`; break;
    case "TIGHT": headline = `Tight: ${av} h of teaching left for ${rem} h of syllabus (buffer ${a.ratio?.toFixed(2)}; below ${a.th.onTrack.toFixed(2)} leaves little room for cancellations).`; break;
    case "DANGER":
      headline = a.available === 0 ? `No scheduled teaching hours remain before the deadline, but ${rem} h of syllabus are still uncovered.`
        : `Not enough time: only ${av} h of teaching left for ${rem} h of syllabus (buffer ${a.ratio?.toFixed(2)}, below ${a.th.tight.toFixed(2)}).`;
      if (a.available !== null) reasons.push(`Short by ${fmt(a.cov.remaining - a.available)} h before the deadline.`);
      break;
  }
  if (a.deadlineLabel && a.risk !== "COMPLETE" && a.risk !== "UNKNOWN") reasons.push(`Deadline: ${a.deadlineLabel}; last teaching day ${a.last}.`);
  if (a.cov.scope > EPS && a.risk !== "COMPLETE") {
    if (a.pace < -EPS) reasons.push(`${fmt(-a.pace)} h behind the original plan (${fmt(a.cov.covered)} h covered vs ${fmt(a.plannedToDate)} h planned so far)${a.risk === "ON_TRACK" || a.risk === "TIGHT" ? " — but remaining capacity still covers it" : ""}.`);
    else if (a.pace > EPS) reasons.push(`${fmt(a.pace)} h ahead of the original plan.`);
    else reasons.push("Exactly on the original plan so far.");
  }
  if (a.overdueTopics.length > 0) reasons.push(`${a.overdueTopics.length} topic(s) past their planned date: ${a.overdueTopics.slice(0, 3).map((t) => t.title).join(", ")}${a.overdueTopics.length > 3 ? "…" : ""}.`);
  if (a.projected) reasons.push(`Projected to finish on ${a.projected}${a.last && a.projected > a.last ? " — after the deadline" : ""}.`);
  else if (a.projectionNote && a.risk !== "COMPLETE" && a.risk !== "UNKNOWN") reasons.push(a.projectionNote);
  if (a.unlogged > 0 && a.risk !== "COMPLETE") reasons.push(`${a.unlogged} past session(s) have no log. If they were taught, log them — coverage may be understated.`);
  return { headline, reasons };
}

/* ---------- roll-ups: the worst subject decides, never an average ---------- */
const rank: Record<RiskStatus, number> = { DANGER: 0, TIGHT: 1, UNKNOWN: 2, ON_TRACK: 3, COMPLETE: 4 };
export const riskRank = rank;
export function worstStatus(statuses: RiskStatus[]): RiskStatus | null {
  return statuses.length === 0 ? null : statuses.reduce((w, s) => (rank[s] < rank[w] ? s : w));
}
