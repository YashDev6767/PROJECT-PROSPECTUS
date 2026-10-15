import type { Env } from "../config/env.js";
import { todayInZone } from "../domain/clock.js";
import type { ExamType } from "../domain/exams.js";
import { DEFAULT_THRESHOLDS, type Thresholds } from "../domain/progress.js";

export interface Settings { timeZone: string; thresholds: Thresholds; deadlineExamType: ExamType }

export const resolveSettings = (env: Partial<Pick<Env, "APP_TIME_ZONE" | "RISK_ON_TRACK_BUFFER" | "RISK_TIGHT_BUFFER" | "SYLLABUS_DEADLINE_EXAM_TYPE">> = {}): Settings => ({
  timeZone: env.APP_TIME_ZONE ?? "Asia/Kolkata",
  thresholds: { onTrack: env.RISK_ON_TRACK_BUFFER ?? DEFAULT_THRESHOLDS.onTrack, tight: env.RISK_TIGHT_BUFFER ?? DEFAULT_THRESHOLDS.tight },
  deadlineExamType: env.SYLLABUS_DEADLINE_EXAM_TYPE ?? "END_TERM",
});

export { todayInZone };
