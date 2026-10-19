/**
 * Exam readiness (pure). Readiness is NOT a prediction of marks: it is the same syllabus-vs-teaching-time test used everywhere else
 * (remaining syllabus hours against the teaching hours left before the exam starts), applied to a specific exam date.
 *
 * Topic scope: `SyllabusTopic.examScope` records the first exam type that assesses a topic. When a subject's topics carry those tags,
 * an exam of type T counts the topics whose tag is T or earlier in the sequence Sessional < Mid-term < PUT < End-term; untagged topics are
 * left out (and counted, so the UI can say so). When no topic of the subject is tagged at all, the whole syllabus is counted, and the
 * result says "whole syllabus" instead of pretending the scope is known.
 */
import type { ExamType } from "./exams.js";
import { worstStatus, type RiskStatus } from "./progress.js";

export const examTypeRank: Record<ExamType, number> = { SESSIONAL: 0, MID_TERM: 1, PUT: 2, END_TERM: 3 };

export type ScopeMode = "exam_scope" | "whole_syllabus";

export function scopeModeFor(topics: Array<{ examScope: ExamType | null }>): ScopeMode {
  return topics.some((t) => t.examScope !== null) ? "exam_scope" : "whole_syllabus";
}

export const topicInExamScope = (mode: ScopeMode, examType: ExamType, topicScope: ExamType | null): boolean =>
  mode === "whole_syllabus" ? true : topicScope !== null && examTypeRank[topicScope] <= examTypeRank[examType];

/** The exam's own status is its worst subject's; an exam with no subjects has none (the UI says so instead of showing a green). */
export const examStatus = (subjectStatuses: RiskStatus[]): RiskStatus | null => worstStatus(subjectStatuses);

export type ExamPhase = "upcoming" | "in_progress";
export const examPhase = (today: string, startsOn: string): ExamPhase => (startsOn <= today ? "in_progress" : "upcoming");
