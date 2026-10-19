import { Router } from "express";
import {
  campusTrackToCsv,
  courseProgressToCsv,
  examReadinessToCsv,
  facultyActivityToCsv,
  teachingDeliveryToCsv,
} from "../domain/reports.js";
import {
  asyncHandler,
  callerFaculty,
  callerRole,
  HttpError,
  needDb,
  parse,
  requireCapability,
} from "../http/errors.js";
import { reportExportQuery, reportQuery } from "../http/schemas.js";
import {
  fetchCampusTrackReport,
  fetchCourseProgressReport,
  fetchExamReadinessReport,
  fetchFacultyActivityReport,
  fetchTeachingDeliveryReport,
  type ReportFilter,
} from "../services/reportsData.js";
import { defaultCampus } from "../http/scope.js";
import type { Deps } from "./deps.js";


export function reportsRouter(deps: Deps): Router {
  const { db, settings, today } = deps;
  const r = Router();

  /* ---- JSON reports data ---- */
  r.get(
    "/reports",
    requireCapability("reports:read"),
    asyncHandler(async (req, res) => {
      const q = parse(reportQuery, req.query);
      const role = callerRole(res);
      const asFaculty = role === "faculty";
      const faculty = (asFaculty ? callerFaculty(res) : q.facultyId) ?? undefined;

      if (asFaculty && !faculty) {
        throw new HttpError(
          403,
          "faculty_identity_required",
          "Choose which faculty member you are acting as (demo mode) before viewing reports.",
        );
      }

      const prisma = needDb(db);

      const asOf = q.asOf ?? today();
      const campus = defaultCampus(res, q.campusId); // checked against the caller's scope; unscoped only for organization-wide accounts
      if (typeof campus === "object") throw campus.error;
      const filter: ReportFilter = {
        campusId: campus,
        track: q.track,
        semesterId: q.semesterId,
        batchId: q.batchId,
        subjectId: q.subjectId,
        facultyId: faculty,
        from: q.from,
        to: q.to,
      };

      const base = {
        type: q.type,
        generatedAt: new Date().toISOString(),
        asOf,
        filter: {
          campusId: campus,
          track: q.track,
          semesterId: q.semesterId,
          batchId: q.batchId,
          subjectId: q.subjectId,
          facultyId: faculty,
          from: q.from,
          to: q.to,
        },
      };

      switch (q.type) {
        case "course_progress": {
          const report = await fetchCourseProgressReport(prisma, filter, settings, asOf);
          res.json({ ...base, courseProgress: report });
          break;
        }
        case "teaching_delivery": {
          const report = await fetchTeachingDeliveryReport(prisma, filter, settings, asOf);
          res.json({ ...base, teachingDelivery: report });
          break;
        }
        case "faculty_activity": {
          const report = await fetchFacultyActivityReport(prisma, filter, settings, asOf);
          res.json({ ...base, facultyActivity: report });
          break;
        }
        case "exam_readiness": {
          const report = await fetchExamReadinessReport(prisma, filter, settings, asOf);
          res.json({ ...base, examReadiness: report });
          break;
        }
        case "campus_track": {
          const report = await fetchCampusTrackReport(prisma, filter, settings, asOf);
          res.json({ ...base, campusTrack: report });
          break;
        }
      }
    }),
  );

  /* ---- CSV report export ---- */
  r.get(
    "/reports/export",
    requireCapability("reports:read"),
    asyncHandler(async (req, res) => {
      const q = parse(reportExportQuery, req.query);
      const role = callerRole(res);
      const asFaculty = role === "faculty";
      const faculty = (asFaculty ? callerFaculty(res) : q.facultyId) ?? undefined;

      if (asFaculty && !faculty) {
        throw new HttpError(
          403,
          "faculty_identity_required",
          "Choose which faculty member you are acting as (demo mode) before exporting reports.",
        );
      }

      const prisma = needDb(db);

      const asOf = q.asOf ?? today();
      const campus = defaultCampus(res, q.campusId); // checked against the caller's scope; unscoped only for organization-wide accounts
      if (typeof campus === "object") throw campus.error;
      const filter: ReportFilter = {
        campusId: campus,
        track: q.track,
        semesterId: q.semesterId,
        batchId: q.batchId,
        subjectId: q.subjectId,
        facultyId: faculty,
        from: q.from,
        to: q.to,
      };

      let csv = "";
      switch (q.type) {
        case "course_progress": {
          const report = await fetchCourseProgressReport(prisma, filter, settings, asOf);
          csv = courseProgressToCsv(report);
          break;
        }
        case "teaching_delivery": {
          const report = await fetchTeachingDeliveryReport(prisma, filter, settings, asOf);
          csv = teachingDeliveryToCsv(report);
          break;
        }
        case "faculty_activity": {
          const report = await fetchFacultyActivityReport(prisma, filter, settings, asOf);
          csv = facultyActivityToCsv(report);
          break;
        }
        case "exam_readiness": {
          const report = await fetchExamReadinessReport(prisma, filter, settings, asOf);
          csv = examReadinessToCsv(report);
          break;
        }
        case "campus_track": {
          const report = await fetchCampusTrackReport(prisma, filter, settings, asOf);
          csv = campusTrackToCsv(report);
          break;
        }
      }

      const filename = `prospectus-${q.type}-${asOf}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    }),
  );

  return r;
}
