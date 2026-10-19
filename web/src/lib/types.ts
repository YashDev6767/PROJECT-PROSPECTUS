// Mirrors the JSON returned by the API (api/src/routes/*).
import type { Category, ExamType, SaturdayRule, Track } from "./labels";

export type RiskLevel = "on_track" | "at_risk" | "critical";
export type RiskStatus = "ON_TRACK" | "TIGHT" | "DANGER" | "COMPLETE" | "UNKNOWN";

export interface Campus { id: string; name: string; city?: string }
export interface SubjectRow {
  id: string; code: string; name: string; faculty: string;
  coveragePct: number; expectedPct: number; hoursBehind: number; risk: RiskLevel; daysToExam: number | null;
  /** live rows only */ status?: RiskStatus; reason?: string; bufferRatio?: number | null; batchName?: string; track?: string; remainingHours?: number; availableHours?: number | null; deadline?: string;
}
export interface UpcomingExam { id: string; name: string; examDate: string; daysToExam: number | null; subtitle?: string; risk?: RiskLevel }
export interface DashboardAssessment { kind: "ready" | "no_active_semester" | "no_subjects" | "needs_data"; message: string; subjects: number; assessed: number; unassessed: number }
export interface Dashboard {
  /** "live" = computed from persisted timetable, logs and syllabus; "demo" = built-in sample numbers */
  dataSource: "demo" | "live";
  overall?: { status: RiskStatus | null; worstSubject: { id: string; name: string; batchName: string } | null; byTrack: Array<{ track: string; status: RiskStatus }> };
  /** live payloads only: what the numbers can honestly say. Only "ready" makes an empty at-risk list mean "nothing is at risk". */
  state?: DashboardAssessment;
  generatedAt: string;
  campuses: Campus[];
  context: { campus: Campus; semester: string; today: string };
  metrics: { overallCoveragePct: number; hoursBehind: number; subjectsAtRisk: number; nextExamInDays: number | null };
  schedule: Array<{ id: string; subject: string; code: string; start: string; end: string; room: string; state: "logged" | "needs_log" | "upcoming"; subjectId?: string; outcome?: string }>;
  atRisk: SubjectRow[];
  exams: UpcomingExam[];
  recentSessions: Array<{ id: string; subject: string; code: string; faculty: string; hours: number; topics: string; date: string }>;
}
export interface Health {
  status: "ok" | "degraded";
  database: { state: "connected" | "not_configured" | "unreachable"; detail?: string; latencyMs?: number };
}

/* ---------- Phase 2: academic setup (mirrors the API serializers) ---------- */

export interface Semester {
  id: string; name: string; academicYear: string; track: Track; campusId: string; startsOn: string; endsOn: string;
  saturdayRule: SaturdayRule; isActive: boolean; isSample: boolean; status: "upcoming" | "active" | "completed"; batchCount: number; examCount: number;
}
export interface CalendarEntry { id: string; title: string; category: Category; startsOn: string; endsOn: string; campusId: string | null; description: string | null; isSample: boolean }
export interface CalendarExam { id: string; name: string; type: ExamType; startsOn: string; endsOn: string; batchName: string | null; isSample: boolean }
export type DayReason = "weekday" | "saturday_working" | "saturday_off" | "sunday" | "holiday" | "special_working_day";
export interface CalendarDay { date: string; weekday: number; working: boolean; reason: DayReason; entryIds: string[]; examIds: string[] }
export interface MonthData {
  month: string; campusId: string; track: Track; saturdayRule: SaturdayRule; ruleSource: "semester" | "default";
  semester: { id: string; name: string; isActive: boolean } | null; days: CalendarDay[]; entries: CalendarEntry[]; exams: CalendarExam[];
}
export interface Exam {
  id: string; name: string; type: ExamType; typeLabel: string; semesterId: string; semesterName: string; campusId: string; track: Track;
  batchId: string | null; batchName: string | null; startsOn: string; endsOn: string; notes: string | null; isSample: boolean;
}
export interface Batch { id: string; name: string; semesterId: string; semesterName: string; campusId: string; campusName: string; track: Track; studentCount: number | null; subjectCount: number; examCount: number; isSample: boolean }
export interface Faculty { id: string; name: string; email: string | null; campusId: string; campusName: string; isSample: boolean; subjectCount: number; weeklyHours: number }
export interface Subject {
  id: string; code: string; name: string; plannedHours: number | null; isSample: boolean; batchId: string; batchName: string;
  semesterId: string; semesterName: string; campusId: string; track: Track; facultyId: string | null; facultyName: string | null;
  weeklyScheduledHours: number; projectedSemesterHours: number; syllabusPlannedHours: number; topicCount: number;
  progress: { risk: RiskStatus; headline: string; coveragePct: number | null; bufferRatio: number | null; remainingHours: number; availableHours: number | null; paceHours: number; overdueCount: number };
}
export interface TimetableEntry {
  id: string; subjectId: string; subjectCode: string; subjectName: string; batchId: string; batchName: string; facultyId: string | null; facultyName: string | null;
  weekday: number; weekdayName: string; startTime: string; endTime: string; room: string | null; hours: number; isSample: boolean;
  nextDate?: string | null; loggedCount?: number; pastUnlogged?: number;
}
export interface SyllabusTopic { id?: string; title: string; plannedHours: number; examScope: ExamType | null }
export interface SyllabusUnit { id?: string; title: string; topics: SyllabusTopic[] }
export interface SyllabusPayload { subject: { id: string; code: string; name: string; batchName: string; plannedHours: number | null; isSample: boolean }; units: SyllabusUnit[]; totalPlannedHours: number }
export interface ImportPreview { valid: boolean; rowCount: number; errors: Array<{ row: number; field: string; message: string }>; units: SyllabusUnit[]; totalPlannedHours: number; existingTopicCount: number }

/* ---------- Phase 3: session logs and progression ---------- */
export type Outcome = "COMPLETED" | "IN_PROGRESS" | "SKIPPED" | "MERGED" | "CANCELLED";
export type WorkStatus = "NOT_GIVEN" | "GIVEN" | "REVIEWED";

export interface ScheduleItem {
  key: string; kind: "scheduled" | "makeup"; date: string; subjectId: string; subjectCode: string; subjectName: string; batchId: string; batchName: string;
  semesterId: string; campusId: string; track: Track; facultyId: string | null; facultyName: string | null; entryId: string | null; makeupOfLogId: string | null;
  startTime: string; endTime: string; hours: number; room: string | null; log: null | { id: string; outcome: Outcome; revision: number; reviewed: boolean };
}
export interface ScheduleResponse { date: string; today: string; items: ScheduleItem[]; notices: Array<{ date: string; campusId: string; semesterName: string; reason: string }> }

export interface LoggedTopic { topicId: string; title: string; unitTitle: string; completionPct: number }
export interface SessionLog {
  id: string; subjectId: string; subjectCode: string; subjectName: string; batchId: string; batchName: string; semesterId: string; campusId: string; track: Track;
  facultyId: string | null; facultyName: string | null; timetableEntryId: string | null; makeupOfId: string | null; mergedIntoId: string | null;
  heldOn: string; slotStart: string | null; slotEnd: string | null; scheduledHours: number | null; actualHours: number | null; hoursTaught: number;
  outcome: Outcome; rescheduledTo: string | null; covered: LoggedTopic[]; leftover: LoggedTopic[]; skipped: LoggedTopic[];
  carryForward: string | null; classworkStatus: WorkStatus; homeworkStatus: WorkStatus; notes: string | null; revision: number;
  reviewedAt: string | null; reviewedByRole: string | null; reviewNote: string | null; loggedByRole: string; loggedByFacultyName: string | null; createdAt: string; updatedAt: string; isSample: boolean;
}
export interface SessionLogDetail extends SessionLog {
  revisions: Array<{ revision: number; note: string; changedByRole: string; at: string; snapshot: Partial<SessionLog> }>;
  mergedLogs: Array<{ id: string; subjectName: string; batchName: string }>;
}

export interface TopicProgress {
  topicId: string; title: string; unitTitle: string; plannedHours: number; status: "skipped" | "not_started" | "in_progress" | "completed";
  completionPct: number; coveredHours: number; remainingHours: number; plannedStart: string | null; plannedEnd: string | null; forecastEnd: string | null; overdue: boolean;
}
export interface SubjectProgress {
  risk: RiskStatus; headline: string; reasons: string[]; hoursInScope: number; coveredHours: number; remainingHours: number; coveragePct: number | null;
  plannedToDateHours: number; paceHours: number; availableHours: number | null; bufferRatio: number | null; projectedCompletion: string | null; projectionNote: string;
  overdueTopics: Array<{ topicId: string; title: string; plannedEnd: string; completionPct: number }>; unloggedPastSessions: number; remainingSessions: number;
  topics: TopicProgress[]; thresholds: { onTrack: number; tight: number };
}
export interface SubjectDetail {
  asOf: string; referenceDate: string; thresholds: { onTrack: number; tight: number };
  subject: { id: string; code: string; name: string; batchId: string; batchName: string; semesterId: string; semesterName: string; campusId: string; track: Track; facultyId: string | null; facultyName: string | null; isSample: boolean };
  deadline: { date: string; lastTeachingDate: string; source: "exam" | "semester_end"; label: string };
  progress: SubjectProgress; hoursTaught: number; sessionsLogged: number; lastLoggedOn: string | null; teachingCapacityHours: number; weeklyHours: number; recentLogs: SessionLog[];
}
export interface SubjectSummary {
  id: string; code: string; name: string; batchId: string; batchName: string; semesterId: string; semesterName: string; campusId: string; track: Track; facultyName: string | null;
  risk: RiskStatus; headline: string; coveragePct: number | null; hoursInScope: number; coveredHours: number; remainingHours: number; availableHours: number | null; bufferRatio: number | null;
  paceHours: number; projectedCompletion: string | null; deadline: string; deadlineLabel: string; overdueCount: number; unloggedPastSessions: number;
}
export interface LogSaveResponse { log: SessionLog; progress: { before: SubjectSummary | null; after: SubjectSummary | null } }

/* ---------- Exam readiness (against each exam's start date; not a marks prediction) ---------- */
export interface ExamReadinessSubject {
  subjectId: string; code: string; name: string; batchName: string; facultyName: string | null; isSample: boolean;
  status: RiskStatus; headline: string; reasons: string[];
  scopeMode: "exam_scope" | "whole_syllabus"; topicsInScope: number; unscopedTopics: number;
  hoursInScope: number; coveredHours: number; remainingHours: number; coveragePct: number | null;
  availableHours: number | null; bufferRatio: number | null; projectedCompletion: string | null; unloggedPastSessions: number;
}
export interface ExamReadinessExam {
  id: string; name: string; type: ExamType; typeLabel: string; startsOn: string; endsOn: string; daysToStart: number; phase: "upcoming" | "in_progress";
  lastTeachingDate: string; notes: string | null; isSample: boolean;
  semester: { id: string; name: string; track: Track }; batch: { id: string; name: string } | null;
  status: RiskStatus | null; subjectCount: number; unassessed: number; note: string | null; subjects: ExamReadinessSubject[];
}
export interface ExamReadinessResponse {
  asOf: string; campusId: string; thresholds: { onTrack: number; tight: number };
  state: "ready" | "no_active_semester" | "no_exams"; message: string; exams: ExamReadinessExam[];
}

/* ---------- Phase 11: Academic Intelligence & Reports ---------- */
export type ReportType = "course_progress" | "teaching_delivery" | "faculty_activity" | "exam_readiness" | "campus_track";

export interface CourseProgressReportItem {
  subjectId: string;
  code: string;
  name: string;
  batchId: string;
  batchName: string;
  semesterId: string;
  semesterName: string;
  campusId: string;
  track: Track;
  facultyId: string | null;
  facultyName: string | null;
  status: RiskStatus;
  coveragePct: number | null;
  hoursInScope: number;
  coveredHours: number;
  remainingHours: number;
  availableHours: number | null;
  bufferRatio: number | null;
  paceHours: number;
  overdueCount: number;
  projectedCompletion: string | null;
  deadline: string;
  deadlineLabel: string;
  headline: string;
  isSample: boolean;
}

export interface CourseProgressSummary {
  totalSubjects: number;
  overallStatus: RiskStatus | null;
  riskCounts: Record<RiskStatus, number>;
  totalHoursInScope: number;
  totalCoveredHours: number;
  totalRemainingHours: number;
  totalAvailableHours: number;
  aggregateCoveragePct: number | null;
}

export interface TeachingDeliveryReportItem {
  subjectId: string;
  code: string;
  name: string;
  batchId: string;
  batchName: string;
  semesterId: string;
  semesterName: string;
  campusId: string;
  track: Track;
  facultyId: string | null;
  facultyName: string | null;
  totalScheduled: number;
  completed: number;
  inProgress: number;
  cancelled: number;
  skipped: number;
  merged: number;
  scheduledHours: number;
  actualHours: number;
  unloggedPast: number;
  deliveryRatePct: number | null;
  isSample: boolean;
}

export interface TeachingDeliverySummary {
  totalScheduled: number;
  totalCompleted: number;
  totalInProgress: number;
  totalCancelled: number;
  totalSkipped: number;
  totalMerged: number;
  totalScheduledHours: number;
  totalActualHours: number;
  totalUnloggedPast: number;
  overallDeliveryRatePct: number | null;
}

export interface FacultyActivityReportItem {
  facultyId: string;
  facultyName: string;
  email: string | null;
  campusId: string;
  assignedSubjectsCount: number;
  totalLogs: number;
  completedLogs: number;
  inProgressLogs: number;
  cancelledLogs: number;
  skippedLogs: number;
  mergedLogs: number;
  hoursTaught: number;
  reviewedLogs: number;
  pendingReviewLogs: number;
  lastLoggedOn: string | null;
  unloggedPast: number;
  isSample: boolean;
}

export interface FacultyActivitySummary {
  totalFaculty: number;
  totalLogs: number;
  totalCompleted: number;
  totalHoursTaught: number;
  totalReviewed: number;
  totalPendingReview: number;
  totalUnloggedPast: number;
}

export interface ExamReadinessReportItem {
  examId: string;
  examName: string;
  examType: ExamType;
  examTypeLabel: string;
  startsOn: string;
  endsOn: string;
  daysToStart: number;
  phase: "upcoming" | "in_progress";
  lastTeachingDate: string;
  subjectId: string;
  code: string;
  name: string;
  batchName: string;
  facultyName: string | null;
  status: RiskStatus;
  coveragePct: number | null;
  hoursInScope: number;
  coveredHours: number;
  remainingHours: number;
  availableHours: number | null;
  bufferRatio: number | null;
  scopeMode: "exam_scope" | "whole_syllabus";
  unscopedTopics: number;
  headline: string;
  isSample: boolean;
}

export interface ExamReadinessReportSummary {
  totalExams: number;
  totalAssessedSubjects: number;
  atRiskCount: number;
  onTrackCount: number;
  completeCount: number;
  needsDataCount: number;
}

export interface CampusTrackSummaryReportItem {
  campusId: string;
  campusName: string;
  track: Track;
  activeSemesterName: string | null;
  totalSubjects: number;
  overallStatus: RiskStatus | null;
  riskCounts: Record<RiskStatus, number>;
  hoursInScope: number;
  coveredHours: number;
  remainingHours: number;
  coveragePct: number | null;
  hoursTaught: number;
  totalScheduled: number;
  totalLogs: number;
}

export interface CampusTrackSummarySummary {
  totalCampuses: number;
  totalSubjects: number;
  institutionalStatus: RiskStatus | null;
  totalHoursInScope: number;
  totalCoveredHours: number;
  totalRemainingHours: number;
  aggregateCoveragePct: number | null;
  totalHoursTaught: number;
}

export interface ReportsResponse {
  type: ReportType;
  generatedAt: string;
  asOf: string;
  filter: {
    campusId?: string;
    track?: Track;
    semesterId?: string;
    batchId?: string;
    subjectId?: string;
    facultyId?: string;
    from?: string;
    to?: string;
  };
  courseProgress?: { items: CourseProgressReportItem[]; summary: CourseProgressSummary };
  teachingDelivery?: { items: TeachingDeliveryReportItem[]; summary: TeachingDeliverySummary };
  facultyActivity?: { items: FacultyActivityReportItem[]; summary: FacultyActivitySummary };
  examReadiness?: { items: ExamReadinessReportItem[]; summary: ExamReadinessReportSummary };
  campusTrack?: { items: CampusTrackSummaryReportItem[]; summary: CampusTrackSummarySummary };
}

/* ---------- Smart carry-forward (unfinished work from the previous teaching session) ---------- */
export interface CarryItem { topicId: string; title: string; unitTitle: string; plannedHours: number; reason: "in_progress" | "leftover"; completionPct: number; remainingHours: number; fromDate: string; fromLogId: string }
export interface CarryForwardResponse { subjectId: string; heldOn: string; source: { logId: string; heldOn: string; outcome: Outcome } | null; items: CarryItem[]; note: string | null }

/* ---------- Student learning portal (read-only, one batch) ---------- */
export type StudentStatusKey = "on_track" | "keep_an_eye" | "needs_attention" | "complete" | "no_data";
export interface StudentStatus { key: StudentStatusKey; label: string }
export interface StudentSubject {
  id: string; code: string; name: string; status: StudentStatus; coveragePct: number | null; hoursInScope: number; coveredHours: number; remainingHours: number;
  coveredTopics: Array<{ title: string; unitTitle: string; completionPct: number }>;
  upcomingTopics: Array<{ title: string; unitTitle: string; completionPct: number; expectedBy: string | null }>;
}
export interface StudentExam {
  id: string; name: string; typeLabel: string; startsOn: string; endsOn: string; daysToStart: number; phase: "upcoming" | "in_progress"; classesEnd: string;
  subjects: Array<{ name: string; code: string; status: StudentStatus; coveragePct: number | null; remainingHours: number; teachingHoursLeft: number | null; scope: string; scopeTopics: Array<{ title: string; unitTitle: string; completionPct: number }> }>;
}
export interface StudentPortalData {
  asOf: string; batch: { id: string; name: string }; campusId: string; track: Track; semester: { name: string; startsOn: string; endsOn: string };
  overview: { subjectCount: number; assessedSubjects: number; overallCoveragePct: number | null; coveredHours: number; hoursInScope: number; needAttention: number };
  subjects: StudentSubject[];
  upcomingClasses: Array<{ date: string; startTime: string; endTime: string; subjectName: string; subjectCode: string; room: string | null; kind: "scheduled" | "makeup" }>;
  exams: StudentExam[];
}
