export type Track = "MIRAI" | "UNIVERSITY";
export type SaturdayRule = "ALL" | "NONE" | "SECOND_FOURTH";
export type Category = "HOLIDAY" | "EVENT" | "EXAM" | "ACADEMIC_DEADLINE" | "SPECIAL_WORKING_DAY";
export type ExamType = "SESSIONAL" | "MID_TERM" | "PUT" | "END_TERM";

export const campusOptions = [
  { id: "hi-tech", name: "HI-Tech" }, { id: "ratnam", name: "Ratnam" }, { id: "rgib", name: "RGIB" }, { id: "juj", name: "JUJ" },
];
export const campusName = (id: string | null) => (id === null ? "All campuses" : campusOptions.find((c) => c.id === id)?.name ?? id);

export const trackLabels: Record<Track, string> = { MIRAI: "Mirai Track", UNIVERSITY: "University Track" };
export const ruleLabels: Record<SaturdayRule, string> = { ALL: "All Saturdays working", NONE: "No Saturdays working", SECOND_FOURTH: "2nd and 4th Saturdays working" };
export const ruleShort: Record<SaturdayRule, string> = { ALL: "All Saturdays", NONE: "No Saturdays", SECOND_FOURTH: "2nd & 4th Saturdays" };
export const categoryLabels: Record<Category, string> = { HOLIDAY: "Holiday", EVENT: "Event", EXAM: "Exam", ACADEMIC_DEADLINE: "Academic deadline", SPECIAL_WORKING_DAY: "Special working day" };
export const examTypeLabels: Record<ExamType, string> = { SESSIONAL: "Sessionals", MID_TERM: "Mid-term", PUT: "Pre-University Test (PUT)", END_TERM: "End-term" };
export const weekdayNames = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const weekdayShort = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const statusLabels = { upcoming: "Upcoming", active: "Active", completed: "Completed" } as const;

export const outcomeLabels = { COMPLETED: "Completed", IN_PROGRESS: "In progress", SKIPPED: "Skipped", MERGED: "Merged", CANCELLED: "Cancelled" } as const;
export const workLabels = { NOT_GIVEN: "Not given", GIVEN: "Given", REVIEWED: "Reviewed in class" } as const;
export const reasonLabels: Record<string, string> = {
  holiday: "a holiday", sunday: "Sunday", saturday_off: "an off Saturday", exam_period: "an exam period", weekday: "a working day", special_working_day: "a special working day", saturday_working: "a working Saturday",
};
