import { rangesOverlap, type ISODate } from "./dates.js";

export type ExamType = "SESSIONAL" | "MID_TERM" | "PUT" | "END_TERM";
export const examTypes: ExamType[] = ["SESSIONAL", "MID_TERM", "PUT", "END_TERM"];
export const examTypeLabels: Record<ExamType, string> = { SESSIONAL: "Sessionals", MID_TERM: "Mid-term", PUT: "Pre-University Test (PUT)", END_TERM: "End-term" };

export interface ExamRange { id?: string; semesterId: string; batchId: string | null; startsOn: ISODate; endsOn: ISODate }

export function validateExamDates(exam: { startsOn: ISODate; endsOn: ISODate }, semester: { startsOn: ISODate; endsOn: ISODate }): string[] {
  const issues: string[] = [];
  if (exam.endsOn < exam.startsOn) issues.push("End date cannot be before the start date");
  else if (exam.startsOn < semester.startsOn || exam.endsOn > semester.endsOn) {
    issues.push(`Exam dates must fall within the semester (${semester.startsOn} to ${semester.endsOn})`);
  }
  return issues;
}

/** Same semester, intersecting dates, and batch scopes that can affect the same students (a null batch = everyone). */
export const findExamOverlaps = <T extends ExamRange>(candidate: ExamRange, existing: T[]): T[] =>
  existing.filter((e) =>
    e.id !== candidate.id &&
    e.semesterId === candidate.semesterId &&
    rangesOverlap(e.startsOn, e.endsOn, candidate.startsOn, candidate.endsOn) &&
    (e.batchId === null || candidate.batchId === null || e.batchId === candidate.batchId));
