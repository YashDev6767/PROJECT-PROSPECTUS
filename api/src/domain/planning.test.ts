import { describe, expect, it } from "vitest";
import { findExamOverlaps, validateExamDates } from "./exams.js";
import { findSemesterOverlaps, semesterStatus, validateAcademicYear, validateDateRange } from "./semesters.js";
import { findConflicts, slotHours, toMinutes, validateSlot, weeklyHours, type SlotRow } from "./timetable.js";
import { can, roleFromHeader } from "./permissions.js";

describe("semester rules", () => {
  it("rejects end dates before start dates but allows equal dates", () => {
    expect(validateDateRange("2026-08-03", "2026-07-01")).toMatch(/before/);
    expect(validateDateRange("2026-08-03", "2026-08-03")).toBeNull();
  });
  it("validates academic years", () => {
    expect(validateAcademicYear("2026-27")).toBeNull();
    expect(validateAcademicYear("2099-00")).toBeNull();
    expect(validateAcademicYear("2026-28")).toMatch(/not consecutive/);
    expect(validateAcademicYear("2026")).toMatch(/format/);
  });
  const existing = [
    { id: "a", campusId: "c1", track: "MIRAI" as const, startsOn: "2026-08-03", endsOn: "2026-12-18" },
    { id: "b", campusId: "c1", track: "UNIVERSITY" as const, startsOn: "2026-08-03", endsOn: "2026-12-18" },
    { id: "c", campusId: "c2", track: "MIRAI" as const, startsOn: "2026-08-03", endsOn: "2026-12-18" },
  ];
  it("warns only for the same campus and track", () => {
    const hits = findSemesterOverlaps({ campusId: "c1", track: "MIRAI", startsOn: "2026-12-01", endsOn: "2027-04-30" }, existing);
    expect(hits.map((h) => h.id)).toEqual(["a"]);
    expect(findSemesterOverlaps({ campusId: "c1", track: "MIRAI", startsOn: "2026-12-19", endsOn: "2027-04-30" }, existing)).toEqual([]);
  });
  it("ignores the semester being edited", () => {
    expect(findSemesterOverlaps({ id: "a", campusId: "c1", track: "MIRAI", startsOn: "2026-09-01", endsOn: "2026-11-01" }, existing)).toEqual([]);
  });
  it("derives status from dates and activation", () => {
    const s = { startsOn: "2026-08-03", endsOn: "2026-12-18" };
    expect(semesterStatus({ ...s, isActive: true }, "2026-10-16")).toBe("active");
    expect(semesterStatus({ ...s, isActive: false }, "2026-10-16")).toBe("upcoming"); // in window but not activated
    expect(semesterStatus({ ...s, isActive: true }, "2026-07-01")).toBe("upcoming");
    expect(semesterStatus({ ...s, isActive: true }, "2026-12-19")).toBe("completed");
  });
});

describe("exam rules", () => {
  const sem = { startsOn: "2026-08-03", endsOn: "2026-12-18" };
  it("validates ordering and semester bounds", () => {
    expect(validateExamDates({ startsOn: "2026-10-10", endsOn: "2026-10-05" }, sem)[0]).toMatch(/before/);
    expect(validateExamDates({ startsOn: "2026-12-10", endsOn: "2026-12-30" }, sem)[0]).toMatch(/within the semester/);
    expect(validateExamDates({ startsOn: "2026-10-05", endsOn: "2026-10-09" }, sem)).toEqual([]);
  });
  const others = [
    { id: "1", semesterId: "s", batchId: null, startsOn: "2026-10-05", endsOn: "2026-10-09" },
    { id: "2", semesterId: "s", batchId: "b1", startsOn: "2026-11-02", endsOn: "2026-11-06" },
    { id: "3", semesterId: "other", batchId: null, startsOn: "2026-11-02", endsOn: "2026-11-06" },
  ];
  it("flags overlaps within the semester; a whole-cohort exam overlaps any batch", () => {
    expect(findExamOverlaps({ semesterId: "s", batchId: "b2", startsOn: "2026-10-09", endsOn: "2026-10-12" }, others).map((e) => e.id)).toEqual(["1"]);
  });
  it("only overlaps scoped exams when batches intersect", () => {
    expect(findExamOverlaps({ semesterId: "s", batchId: "b2", startsOn: "2026-11-03", endsOn: "2026-11-04" }, others)).toEqual([]);
    expect(findExamOverlaps({ semesterId: "s", batchId: "b1", startsOn: "2026-11-03", endsOn: "2026-11-04" }, others).map((e) => e.id)).toEqual(["2"]);
  });
});

describe("timetable rules", () => {
  it("parses and validates times", () => {
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("24:00")).toBeNull();
    expect(toMinutes("9:30")).toBeNull();
    expect(validateSlot("10:00", "09:00")).toMatch(/after/);
    expect(validateSlot("10:00", "10:00")).toMatch(/after/);
    expect(validateSlot("9am", "10:00")).toMatch(/HH:MM/);
    expect(validateSlot("09:00", "10:30")).toBeNull();
    expect(slotHours("09:00", "10:30")).toBe(1.5);
  });
  const row = (over: Partial<SlotRow>): SlotRow => ({ id: "x", weekday: 1, startTime: "09:00", endTime: "10:00", batchId: "b1", batchName: "Batch A", facultyId: "f1", facultyName: "A. Rao", subjectName: "Data Structures", ...over });
  const existing = [row({ id: "e1" })];

  it("detects faculty conflicts with a useful message", () => {
    const c = findConflicts(row({ id: undefined, batchId: "b2", batchName: "Batch B", startTime: "09:30", endTime: "10:30", subjectName: "Maths" }), existing);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ type: "faculty", withEntryId: "e1" });
    expect(c[0]!.message).toBe("A. Rao already teaches Data Structures to Batch A on Monday 09:00–10:00.");
  });
  it("detects batch conflicts even with a different teacher", () => {
    const c = findConflicts(row({ id: undefined, facultyId: "f2", startTime: "09:00", endTime: "09:30" }), existing);
    expect(c.map((x) => x.type)).toEqual(["batch"]);
  });
  it("reports both when faculty and batch clash", () => {
    expect(findConflicts(row({ id: undefined }), existing).map((c) => c.type)).toEqual(["faculty", "batch"]);
  });
  it("allows back-to-back classes, other weekdays and unassigned faculty", () => {
    expect(findConflicts(row({ id: undefined, startTime: "10:00", endTime: "11:00" }), existing)).toEqual([]);
    expect(findConflicts(row({ id: undefined, weekday: 2 }), existing)).toEqual([]);
    expect(findConflicts(row({ id: undefined, batchId: "b2", facultyId: null }), existing)).toEqual([]);
  });
  it("does not conflict with itself when editing", () => {
    expect(findConflicts(row({ id: "e1" }), existing)).toEqual([]);
  });
  it("derives weekly hours", () => {
    expect(weeklyHours([{ startTime: "09:00", endTime: "10:30" }, { startTime: "11:00", endTime: "12:00" }])).toBe(2.5);
  });
});

describe("permissions (demo-only)", () => {
  it("restricts semester writes to admins and academic writes to admins/managers", () => {
    expect(can("admin", "semesters:write")).toBe(true);
    expect(can("campus_manager", "semesters:write")).toBe(false);
    expect(can("campus_manager", "academic:write")).toBe(true);
    expect(can("faculty", "academic:write")).toBe(false);
    expect(can("student", "special_working_day:write")).toBe(false);
    expect(can(null, "academic:write")).toBe(false);
  });
  it("parses the demo role header strictly", () => {
    expect(roleFromHeader("faculty")).toBe("faculty");
    expect(roleFromHeader("root")).toBeNull();
    expect(roleFromHeader(undefined)).toBeNull();
  });
});
