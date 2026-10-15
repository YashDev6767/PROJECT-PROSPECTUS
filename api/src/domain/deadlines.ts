import { addDays, type ISODate } from "./dates.js";
import { examTypeLabels, type ExamType } from "./exams.js";

export interface ExamLite { type: ExamType; startsOn: ISODate; batchId: string | null }
export interface Deadline {
  date: ISODate; // the day the exam / semester ends
  lastTeachingDate: ISODate; // the last day a class can still help
  source: "exam" | "semester_end";
  examType: ExamType | null;
  label: string;
}

/**
 * Syllabus-completion deadline for a batch: the earliest start of the preferred exam type (default End-term) that applies
 * to it (cohort-wide or scoped to this batch). Classes stop the day before the exam. If that exam is not scheduled yet the
 * semester end date is used and the label says so — never a silent guess.
 */
export function pickDeadline(exams: ExamLite[], batchId: string, semesterEnd: ISODate, preferred: ExamType = "END_TERM"): Deadline {
  const matches = exams.filter((e) => e.type === preferred && (e.batchId === null || e.batchId === batchId)).map((e) => e.startsOn).sort();
  if (matches.length > 0) {
    const date = matches[0]!;
    return { date, lastTeachingDate: addDays(date, -1), source: "exam", examType: preferred, label: `${examTypeLabels[preferred]} starts ${date}` };
  }
  return { date: semesterEnd, lastTeachingDate: semesterEnd, source: "semester_end", examType: null, label: `semester end ${semesterEnd} (no ${examTypeLabels[preferred]} scheduled yet)` };
}
