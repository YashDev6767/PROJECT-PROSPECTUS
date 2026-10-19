import {
  BarChart3,
  CalendarX2,
  Download,
  FilterX,
  RotateCcw,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Progress,
  RiskBadge,
  riskLabel,
  SampleBadge,
  Stat,
  StatStrip,
  Tabs,
  tableClasses,
} from "../components/ui";
import { Field, Input, Select } from "../components/ui/forms";
import { Boundary, useResource } from "../components/ui/Resource";
import { useToast } from "../components/ui/Toast";
import { useApp } from "../context/AppContext";
import { downloadCsv } from "../lib/api";
import { daysLabel, shortDate } from "../lib/format";
import { campusName, trackLabels, type Track } from "../lib/labels";
import type {
  Batch,
  Campus,
  CampusTrackSummaryReportItem,
  CourseProgressReportItem,
  ExamReadinessReportItem,
  Faculty,
  FacultyActivityReportItem,
  ReportsResponse,
  ReportType,
  Semester,
  Subject,
  TeachingDeliveryReportItem,
} from "../lib/types";

const h = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Number(n.toFixed(2))} h`);

export function Reports() {
  const { campusId: contextCampusId, role, facultyId } = useApp();
  const isFacultyRole = role === "faculty";
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<ReportType>("course_progress");

  // Filters
  const [selectedCampus, setSelectedCampus] = useState<string>(contextCampusId || "");
  const [selectedTrack, setSelectedTrack] = useState<Track | "">("");
  const [selectedSemester, setSelectedSemester] = useState<string>("");
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedFaculty, setSelectedFaculty] = useState<string>(isFacultyRole ? facultyId || "" : "");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  // Dynamic filter options from existing APIs
  const campusesRes = useResource<{ campuses: Campus[] }>("/api/meta");
  const semestersRes = useResource<{ semesters: Semester[] }>(
    selectedCampus ? `/api/semesters?campusId=${selectedCampus}${selectedTrack ? `&track=${selectedTrack}` : ""}` : null,
  );
  const batchesRes = useResource<{ batches: Batch[] }>(
    selectedCampus ? `/api/batches?campusId=${selectedCampus}${selectedSemester ? `&semesterId=${selectedSemester}` : ""}` : null,
  );
  const facultyRes = useResource<{ faculty: Faculty[] }>(
    selectedCampus ? `/api/faculty?campusId=${selectedCampus}` : "/api/faculty",
  );
  const subjectsRes = useResource<{ subjects: Subject[] }>(
    selectedCampus ? `/api/subjects?campusId=${selectedCampus}${selectedBatch ? `&batchId=${selectedBatch}` : ""}` : null,
  );

  const resetFilters = () => {
    setSelectedCampus(contextCampusId || "");
    setSelectedTrack("");
    setSelectedSemester("");
    setSelectedBatch("");
    setSelectedSubject("");
    setSelectedFaculty(isFacultyRole ? facultyId || "" : "");
    setFromDate("");
    setToDate("");
    toast("Filters reset");
  };

  const hasActiveFilters = Boolean(
    (selectedCampus && selectedCampus !== contextCampusId) ||
      selectedTrack ||
      selectedSemester ||
      selectedBatch ||
      selectedSubject ||
      selectedFaculty ||
      fromDate ||
      toDate,
  );

  // Construct query string for current report tab
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("type", activeTab);
    if (selectedCampus) params.set("campusId", selectedCampus);
    if (selectedTrack) params.set("track", selectedTrack);
    if (selectedSemester) params.set("semesterId", selectedSemester);
    if (selectedBatch) params.set("batchId", selectedBatch);
    if (selectedSubject) params.set("subjectId", selectedSubject);
    if (selectedFaculty) params.set("facultyId", selectedFaculty);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return params.toString();
  }, [
    activeTab,
    selectedCampus,
    selectedTrack,
    selectedSemester,
    selectedBatch,
    selectedSubject,
    selectedFaculty,
    fromDate,
    toDate,
  ]);

  const reportRes = useResource<ReportsResponse>(`/api/reports?${queryString}`);

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportUrl = `/api/reports/export?${queryString}&format=csv`;
      await downloadCsv(exportUrl, `prospectus-${activeTab}-report.csv`);
      toast("Export complete");
    } catch {
      toast("Export failed. Please check permissions and try again.");
    } finally {
      setExporting(false);
    }
  };

  const tabs = [
    { id: "course_progress" as const, label: "Course Progress" },
    { id: "teaching_delivery" as const, label: "Teaching Delivery" },
    { id: "faculty_activity" as const, label: "Faculty Activity" },
    { id: "exam_readiness" as const, label: "Exam Readiness" },
    { id: "campus_track" as const, label: "Campus & Track" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reports"
        subtitle="Academic intelligence, syllabus progression, delivery tracking, and CSV exports"
        actions={
          <Button variant="primary" onClick={handleExport} disabled={exporting}>
            <Download className="size-4" aria-hidden />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-full overflow-x-auto pb-1">
          <Tabs value={activeTab} onChange={(t) => setActiveTab(t)} tabs={tabs} label="Report views" />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" onClick={resetFilters} className="min-h-10 text-xs self-start sm:self-auto">
            <RotateCcw className="size-3.5" aria-hidden /> Reset filters
          </Button>
        )}
      </div>

      {/* Filter Bar */}
      <Card title="Report Filters" description="Narrow academic data across campuses, batches, faculty, and date ranges">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Campus">
            <Select value={selectedCampus} onChange={(e) => setSelectedCampus(e.target.value)}>
              <option value="">All Campuses</option>
              {campusesRes.data?.campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Track">
            <Select value={selectedTrack} onChange={(e) => setSelectedTrack(e.target.value as Track | "")}>
              <option value="">All Tracks</option>
              <option value="MIRAI">Mirai Track</option>
              <option value="UNIVERSITY">University Track</option>
            </Select>
          </Field>

          <Field label="Semester">
            <Select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              disabled={!selectedCampus || !(semestersRes.data?.semesters?.length)}
            >
              <option value="">All Semesters</option>
              {semestersRes.data?.semesters?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({trackLabels[s.track]})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Batch">
            <Select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              disabled={!selectedCampus || !(batchesRes.data?.batches?.length)}
            >
              <option value="">All Batches</option>
              {batchesRes.data?.batches?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.semesterName})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Subject">
            <Select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              disabled={!selectedCampus || !(subjectsRes.data?.subjects?.length)}
            >
              <option value="">All Subjects</option>
              {subjectsRes.data?.subjects?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name} ({s.batchName})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Faculty">
            <Select
              value={selectedFaculty}
              onChange={(e) => setSelectedFaculty(e.target.value)}
              disabled={isFacultyRole || !(facultyRes.data?.faculty?.length)}
            >
              <option value="">{isFacultyRole ? "Assigned Faculty Only" : "All Faculty"}</option>
              {facultyRes.data?.faculty?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.campusName})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="From Date" hint="YYYY-MM-DD">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Field>

          <Field label="To Date" hint="YYYY-MM-DD">
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </Field>
        </div>
      </Card>

      {/* Main Report Body */}
      <Boundary res={reportRes} lines={5}>
        {(data) => {
          if (activeTab === "course_progress" && data.courseProgress) {
            const { items, summary } = data.courseProgress;
            return (
              <div className="space-y-6">
                <StatStrip label="Course Progress Summary">
                  <Stat label="Total Subjects" value={String(summary.totalSubjects)} hint="in active scope" />
                  <Stat
                    label="Overall Status"
                    value={summary.overallStatus ? riskLabel(summary.overallStatus) : "—"}
                    hint="worst subject decides"
                  />
                  <Stat
                    label="Aggregate Coverage"
                    value={summary.aggregateCoveragePct !== null ? `${summary.aggregateCoveragePct}%` : "—"}
                    hint={`${h(summary.totalCoveredHours)} of ${h(summary.totalHoursInScope)}`}
                  />
                  <Stat
                    label="Remaining Syllabus"
                    value={h(summary.totalRemainingHours)}
                    hint={`Available: ${h(summary.totalAvailableHours)}`}
                  />
                </StatStrip>

                {items.length === 0 ? (
                  <EmptyState icon={FilterX} title="No subjects match these filters">
                    Try clearing or widening your campus or semester filters.
                  </EmptyState>
                ) : (
                  <div className={tableClasses.wrap}>
                    <table className={tableClasses.table}>
                      <caption className="sr-only">Course Progress Report</caption>
                      <thead>
                        <tr>
                          {[
                            "Subject",
                            "Batch & Track",
                            "Faculty",
                            "Status",
                            "Coverage",
                            "Syllabus Left",
                            "Teaching Left",
                            "Buffer",
                            "Pace",
                            "Deadline",
                          ].map((col) => (
                            <th key={col} scope="col" className={tableClasses.th}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <CourseProgressRow key={item.subjectId} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          }

          if (activeTab === "teaching_delivery" && data.teachingDelivery) {
            const { items, summary } = data.teachingDelivery;
            return (
              <div className="space-y-6">
                <StatStrip label="Teaching Delivery Summary">
                  <Stat label="Scheduled Sessions" value={String(summary.totalScheduled)} hint="in evaluated window" />
                  <Stat
                    label="Completed Sessions"
                    value={String(summary.totalCompleted)}
                    hint={`In progress: ${summary.totalInProgress}`}
                  />
                  <Stat
                    label="Hours Delivered"
                    value={h(summary.totalActualHours)}
                    hint={`Scheduled: ${h(summary.totalScheduledHours)}`}
                  />
                  <Stat
                    label="Delivery Rate"
                    value={summary.overallDeliveryRatePct !== null ? `${summary.overallDeliveryRatePct}%` : "—"}
                    hint={`Unlogged past: ${summary.totalUnloggedPast}`}
                  />
                </StatStrip>

                {items.length === 0 ? (
                  <EmptyState icon={FilterX} title="No delivery records found">
                    No scheduled sessions match the selected filters and date range.
                  </EmptyState>
                ) : (
                  <div className={tableClasses.wrap}>
                    <table className={tableClasses.table}>
                      <caption className="sr-only">Teaching Delivery Report</caption>
                      <thead>
                        <tr>
                          {[
                            "Subject",
                            "Batch",
                            "Faculty",
                            "Scheduled",
                            "Completed",
                            "Cancelled",
                            "Merged",
                            "Hours Taught",
                            "Unlogged",
                            "Delivery Rate",
                          ].map((col) => (
                            <th key={col} scope="col" className={tableClasses.th}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <TeachingDeliveryRow key={item.subjectId} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          }

          if (activeTab === "faculty_activity" && data.facultyActivity) {
            const { items, summary } = data.facultyActivity;
            return (
              <div className="space-y-6">
                <StatStrip label="Faculty Activity Summary">
                  <Stat label="Active Faculty" value={String(summary.totalFaculty)} hint="in authorized scope" />
                  <Stat label="Total Session Logs" value={String(summary.totalLogs)} hint={`Completed: ${summary.totalCompleted}`} />
                  <Stat label="Total Teaching Hours" value={h(summary.totalHoursTaught)} hint="delivered in class" />
                  <Stat
                    label="Reviews Completed"
                    value={String(summary.totalReviewed)}
                    hint={`Pending: ${summary.totalPendingReview}`}
                  />
                </StatStrip>

                {items.length === 0 ? (
                  <EmptyState icon={Users} title="No faculty activity recorded">
                    No faculty match the selected criteria or scope.
                  </EmptyState>
                ) : (
                  <div className={tableClasses.wrap}>
                    <table className={tableClasses.table}>
                      <caption className="sr-only">Faculty Activity Report</caption>
                      <thead>
                        <tr>
                          {[
                            "Faculty Member",
                            "Campus",
                            "Assigned Subjects",
                            "Total Logs",
                            "Completed",
                            "Cancelled / Skipped",
                            "Hours Taught",
                            "Reviewed",
                            "Unlogged Past",
                            "Last Active",
                          ].map((col) => (
                            <th key={col} scope="col" className={tableClasses.th}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <FacultyActivityRow key={item.facultyId} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          }

          if (activeTab === "exam_readiness" && data.examReadiness) {
            const { items, summary } = data.examReadiness;
            return (
              <div className="space-y-6">
                <StatStrip label="Exam Readiness Summary">
                  <Stat label="Upcoming Exams" value={String(summary.totalExams)} hint="under evaluation" />
                  <Stat label="Assessed Subjects" value={String(summary.totalAssessedSubjects)} hint="across cohorts" />
                  <Stat
                    label="Subjects at Risk"
                    value={String(summary.atRiskCount)}
                    hint={`On track: ${summary.onTrackCount}`}
                  />
                  <Stat
                    label="Needs Data"
                    value={String(summary.needsDataCount)}
                    hint="missing syllabus/capacity"
                  />
                </StatStrip>

                {items.length === 0 ? (
                  <EmptyState icon={CalendarX2} title="No exam readiness records">
                    No active or upcoming exams configured for this selection.
                  </EmptyState>
                ) : (
                  <div className={tableClasses.wrap}>
                    <table className={tableClasses.table}>
                      <caption className="sr-only">Exam Readiness Report</caption>
                      <thead>
                        <tr>
                          {[
                            "Exam",
                            "Subject",
                            "Batch",
                            "Faculty",
                            "Readiness Status",
                            "Coverage",
                            "Syllabus Left",
                            "Teaching Left",
                            "Buffer",
                            "Scope Mode",
                          ].map((col) => (
                            <th key={col} scope="col" className={tableClasses.th}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => (
                          <ExamReadinessRow key={`${item.examId}-${item.subjectId}-${idx}`} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          }

          if (activeTab === "campus_track" && data.campusTrack) {
            const { items, summary } = data.campusTrack;
            return (
              <div className="space-y-6">
                <StatStrip label="Campus and Track Summary">
                  <Stat label="Total Campuses" value={String(summary.totalCampuses)} hint="represented" />
                  <Stat label="Total Subjects" value={String(summary.totalSubjects)} hint="institutional cohort" />
                  <Stat
                    label="Institutional Status"
                    value={summary.institutionalStatus ? riskLabel(summary.institutionalStatus as any) : "—"}
                    hint="worst subject overall"
                  />
                  <Stat
                    label="Aggregate Coverage"
                    value={summary.aggregateCoveragePct !== null ? `${summary.aggregateCoveragePct}%` : "—"}
                    hint={`${h(summary.totalCoveredHours)} / ${h(summary.totalHoursInScope)}`}
                  />
                </StatStrip>

                {items.length === 0 ? (
                  <EmptyState icon={BarChart3} title="No campus summary data">
                    No active semester or cohort found for the selected campuses.
                  </EmptyState>
                ) : (
                  <div className={tableClasses.wrap}>
                    <table className={tableClasses.table}>
                      <caption className="sr-only">Campus and Track Summary Report</caption>
                      <thead>
                        <tr>
                          {[
                            "Campus",
                            "Track",
                            "Active Semester",
                            "Overall Status",
                            "Subjects",
                            "Danger",
                            "Tight",
                            "On Track",
                            "Coverage %",
                            "Hours Taught",
                          ].map((col) => (
                            <th key={col} scope="col" className={tableClasses.th}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => (
                          <CampusTrackRow key={`${item.campusId}-${item.track}-${idx}`} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          }

          return null;
        }}
      </Boundary>
    </div>
  );
}

/* =========================================================================
   Table Row Components
   ========================================================================= */

function CourseProgressRow({ item }: { item: CourseProgressReportItem }) {
  return (
    <tr>
      <td className={`${tableClasses.td} min-w-[14rem]`}>
        <Link to={`/subjects/${item.subjectId}`} className="-my-3 inline-block py-3 font-medium text-fg hover:text-accent-text">
          {item.name}
        </Link>{" "}
        {item.isSample && <SampleBadge />}
        <p className="text-xs text-fg-subtle">{item.code}</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-fg-muted">{item.headline}</p>
      </td>
      <td className={tableClasses.td}>
        <p className="font-medium text-fg">{item.batchName}</p>
        <p className="text-xs text-fg-subtle">{trackLabels[item.track]}</p>
      </td>
      <td className={`${tableClasses.td} text-xs text-fg-2`}>{item.facultyName ?? "No faculty"}</td>
      <td className={tableClasses.td}>
        <RiskBadge status={item.status} />
      </td>
      <td className={`${tableClasses.td} min-w-[8rem]`}>
        {item.coveragePct !== null ? (
          <>
            <span className="tabular-nums text-fg">{item.coveragePct}%</span>
            <div className="mt-1">
              <Progress value={item.coveragePct} label={`${item.name} coverage`} />
            </div>
          </>
        ) : (
          <span className="text-fg-faint">—</span>
        )}
      </td>
      <td className={`${tableClasses.td} tabular-nums`}>{h(item.remainingHours)}</td>
      <td className={`${tableClasses.td} tabular-nums`}>{h(item.availableHours)}</td>
      <td className={`${tableClasses.td} tabular-nums`}>
        {typeof item.bufferRatio === "number" ? item.bufferRatio.toFixed(2) : "—"}
      </td>
      <td className={`${tableClasses.td} tabular-nums`}>
        <span className={item.paceHours < 0 ? "text-warn" : "text-fg"}>{h(item.paceHours)}</span>
      </td>
      <td className={`${tableClasses.td} text-xs text-fg-subtle`}>
        <p>{shortDate(item.deadline)}</p>
        <p className="text-[11px] text-fg-faint">{item.deadlineLabel}</p>
      </td>
    </tr>
  );
}

function TeachingDeliveryRow({ item }: { item: TeachingDeliveryReportItem }) {
  return (
    <tr>
      <td className={`${tableClasses.td} min-w-[13rem]`}>
        <Link to={`/subjects/${item.subjectId}`} className="-my-3 inline-block py-3 font-medium text-fg hover:text-accent-text">
          {item.name}
        </Link>{" "}
        {item.isSample && <SampleBadge />}
        <p className="text-xs text-fg-subtle">{item.code}</p>
      </td>
      <td className={tableClasses.td}>
        <p className="font-medium text-fg">{item.batchName}</p>
        <p className="text-xs text-fg-subtle">{item.semesterName}</p>
      </td>
      <td className={`${tableClasses.td} text-xs text-fg-2`}>{item.facultyName ?? "No faculty"}</td>
      <td className={`${tableClasses.td} tabular-nums font-medium text-fg`}>{item.totalScheduled}</td>
      <td className={`${tableClasses.td} tabular-nums text-ok`}>{item.completed}</td>
      <td className={`${tableClasses.td} tabular-nums text-danger`}>{item.cancelled}</td>
      <td className={`${tableClasses.td} tabular-nums text-fg-muted`}>{item.merged}</td>
      <td className={`${tableClasses.td} tabular-nums font-medium text-fg`}>
        {h(item.actualHours)} <span className="text-xs text-fg-subtle">/ {h(item.scheduledHours)}</span>
      </td>
      <td className={`${tableClasses.td} tabular-nums text-warn`}>{item.unloggedPast}</td>
      <td className={`${tableClasses.td} tabular-nums font-semibold text-fg`}>
        {item.deliveryRatePct !== null ? `${item.deliveryRatePct}%` : "—"}
      </td>
    </tr>
  );
}

function FacultyActivityRow({ item }: { item: FacultyActivityReportItem }) {
  return (
    <tr>
      <td className={`${tableClasses.td} min-w-[12rem]`}>
        <p className="font-medium text-fg">{item.facultyName}</p>
        {item.email && <p className="text-xs text-fg-subtle">{item.email}</p>}
      </td>
      <td className={`${tableClasses.td} text-xs text-fg-2`}>{campusName(item.campusId)}</td>
      <td className={`${tableClasses.td} tabular-nums text-fg`}>{item.assignedSubjectsCount}</td>
      <td className={`${tableClasses.td} tabular-nums font-medium text-fg`}>{item.totalLogs}</td>
      <td className={`${tableClasses.td} tabular-nums text-ok`}>{item.completedLogs}</td>
      <td className={`${tableClasses.td} tabular-nums text-danger`}>{item.cancelledLogs + item.skippedLogs}</td>
      <td className={`${tableClasses.td} tabular-nums font-medium text-fg`}>{h(item.hoursTaught)}</td>
      <td className={`${tableClasses.td} tabular-nums text-fg-2`}>
        <span className="text-ok font-medium">{item.reviewedLogs}</span>
        {item.pendingReviewLogs > 0 && (
          <span className="ml-1 text-xs text-warn">({item.pendingReviewLogs} pending)</span>
        )}
      </td>
      <td className={`${tableClasses.td} tabular-nums text-warn`}>{item.unloggedPast}</td>
      <td className={`${tableClasses.td} text-xs text-fg-subtle`}>
        {item.lastLoggedOn ? shortDate(item.lastLoggedOn) : "Never"}
      </td>
    </tr>
  );
}

function ExamReadinessRow({ item }: { item: ExamReadinessReportItem }) {
  return (
    <tr>
      <td className={`${tableClasses.td} min-w-[11rem]`}>
        <p className="font-medium text-fg">{item.examName}</p>
        <p className="text-xs text-fg-subtle">
          {item.examTypeLabel} · {shortDate(item.startsOn)} ({daysLabel(item.daysToStart)})
        </p>
      </td>
      <td className={`${tableClasses.td} min-w-[12rem]`}>
        <Link to={`/subjects/${item.subjectId}`} className="-my-3 inline-block py-3 font-medium text-fg hover:text-accent-text">
          {item.name}
        </Link>
        <p className="text-xs text-fg-subtle">{item.code}</p>
        <p className="mt-1 max-w-xs text-xs text-fg-muted">{item.headline}</p>
      </td>
      <td className={tableClasses.td}>{item.batchName}</td>
      <td className={`${tableClasses.td} text-xs text-fg-2`}>{item.facultyName ?? "No faculty"}</td>
      <td className={tableClasses.td}>
        <RiskBadge status={item.status} />
      </td>
      <td className={`${tableClasses.td} tabular-nums text-fg`}>
        {item.coveragePct !== null ? `${item.coveragePct}%` : "—"}
      </td>
      <td className={`${tableClasses.td} tabular-nums`}>{h(item.remainingHours)}</td>
      <td className={`${tableClasses.td} tabular-nums`}>{h(item.availableHours)}</td>
      <td className={`${tableClasses.td} tabular-nums`}>
        {typeof item.bufferRatio === "number" ? item.bufferRatio.toFixed(2) : "—"}
      </td>
      <td className={`${tableClasses.td} text-xs text-fg-subtle`}>
        {item.scopeMode === "exam_scope" ? "Assessed topics" : "Whole syllabus"}
        {item.unscopedTopics > 0 && <span className="block text-warn">({item.unscopedTopics} untagged)</span>}
      </td>
    </tr>
  );
}

function CampusTrackRow({ item }: { item: CampusTrackSummaryReportItem }) {
  return (
    <tr>
      <td className={`${tableClasses.td} font-medium text-fg`}>{item.campusName}</td>
      <td className={tableClasses.td}>
        <Badge tone="accent">{trackLabels[item.track]}</Badge>
      </td>
      <td className={`${tableClasses.td} text-xs text-fg-2`}>{item.activeSemesterName ?? "None active"}</td>
      <td className={tableClasses.td}>
        <RiskBadge status={item.overallStatus} />
      </td>
      <td className={`${tableClasses.td} tabular-nums font-medium text-fg`}>{item.totalSubjects}</td>
      <td className={`${tableClasses.td} tabular-nums text-danger font-medium`}>{item.riskCounts.DANGER}</td>
      <td className={`${tableClasses.td} tabular-nums text-warn font-medium`}>{item.riskCounts.TIGHT}</td>
      <td className={`${tableClasses.td} tabular-nums text-ok font-medium`}>{item.riskCounts.ON_TRACK}</td>
      <td className={`${tableClasses.td} tabular-nums font-semibold text-fg`}>
        {item.coveragePct !== null ? `${item.coveragePct}%` : "—"}
      </td>
      <td className={`${tableClasses.td} tabular-nums font-medium text-fg`}>{h(item.hoursTaught)}</td>
    </tr>
  );
}
