/**
 * Smart carry-forward (pure): which unfinished topics from the previous teaching session should be offered when logging the next one.
 *
 * Source of truth is the STRUCTURED topic entries of earlier logs (COVERED with completion < 100, LEFTOVER), resolved against the same
 * "latest entry wins" topic state the progression engine uses — never free text. Rules:
 *  - The source is the most recent log of the SAME SUBJECT (a subject belongs to exactly one batch) dated strictly before the session
 *    being logged, with a teaching outcome (Completed / In progress / Merged). Cancelled and Skipped logs teach nothing, so they are
 *    passed over, not used as a source, and do not stop earlier unfinished work from being offered.
 *  - An item is offered only if, after every counting log before that date, the topic is still unfinished: not covered to 100% and not
 *    marked Skipped (an explicit exclusion).
 *  - Items that were carried once and are still unfinished stay eligible (they appear as LEFTOVER again when faculty keep them).
 *  - The log being edited (excludeLogId) and everything on or after the session date are ignored, so editing never offers its own work.
 * Nothing here changes a stored record or a progression number.
 */
import type { ISODate } from "./dates.js";
import { resolveTopicStates, round2, type TopicEntryInput, type TopicInput } from "./progress.js";
import { countsForCoverage, type Outcome } from "./sessionLogs.js";

export interface CarryLog {
  id: string; heldOn: ISODate; createdAtMs: number; outcome: Outcome; carryForward: string | null;
  entries: Array<{ topicId: string; kind: "COVERED" | "LEFTOVER" | "SKIPPED"; completionPct: number }>;
}
export interface CarryItem {
  topicId: string; title: string; unitTitle: string; plannedHours: number;
  reason: "in_progress" | "leftover"; completionPct: number; remainingHours: number; fromDate: ISODate; fromLogId: string;
}
export interface CarryResult { source: { logId: string; heldOn: ISODate; outcome: Outcome } | null; items: CarryItem[]; note: string | null }

export function carryForwardFor(args: { logs: CarryLog[]; topics: TopicInput[]; heldOn: ISODate; excludeLogId?: string | null }): CarryResult {
  const { logs, topics, heldOn, excludeLogId } = args;
  const before = logs.filter((l) => l.id !== excludeLogId && l.heldOn < heldOn);
  const sources = before.filter((l) => countsForCoverage(l.outcome)) // Completed, In progress, Merged
    .sort((a, b) => b.heldOn.localeCompare(a.heldOn) || b.createdAtMs - a.createdAtMs);
  const source = sources[0];
  if (!source) return { source: null, items: [], note: null };

  const states = resolveTopicStates(
    before.filter((l) => countsForCoverage(l.outcome)).flatMap((l) => l.entries.map((e): TopicEntryInput => ({ topicId: e.topicId, kind: e.kind, completionPct: e.completionPct, heldOn: l.heldOn, seq: l.createdAtMs }))),
  );
  const byId = new Map(topics.map((t, i) => [t.id, { t, i }]));
  const seen = new Set<string>();
  const items: Array<CarryItem & { order: number }> = [];
  for (const e of source.entries) {
    if (e.kind === "SKIPPED" || seen.has(e.topicId)) continue;
    const meta = byId.get(e.topicId);
    if (!meta) continue; // topic no longer in the syllabus
    const st = states.get(e.topicId);
    if (st?.kind === "skipped") continue; // explicitly excluded later
    const pct = st?.kind === "covered" ? st.pct : 0;
    if (pct >= 100) continue; // already completed (possibly by a later session)
    if (e.kind === "COVERED" && e.completionPct >= 100) continue;
    seen.add(e.topicId);
    items.push({
      topicId: e.topicId, title: meta.t.title, unitTitle: meta.t.unitTitle, plannedHours: round2(meta.t.plannedHours),
      reason: e.kind === "COVERED" ? "in_progress" : "leftover", completionPct: pct, remainingHours: round2((meta.t.plannedHours * (100 - pct)) / 100),
      fromDate: source.heldOn, fromLogId: source.id, order: meta.i,
    });
  }
  items.sort((a, b) => a.order - b.order);
  return { source: { logId: source.id, heldOn: source.heldOn, outcome: source.outcome }, items: items.map(({ order: _o, ...i }) => i), note: source.carryForward?.trim() || null };
}
