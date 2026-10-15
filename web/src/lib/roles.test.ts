import { describe, expect, it } from "vitest";
import { can } from "./permissions";
import { canLogSessions, navFor } from "./roles";

const paths = (r: Parameters<typeof navFor>[0]) => navFor(r).map((n) => n.path);

describe("role-aware navigation", () => {
  it("gives admins every section", () => expect(paths("admin")).toHaveLength(10));
  it("gives campus managers reports, settings and the academic setup pages", () => {
    expect(paths("campus_manager")).toEqual(expect.arrayContaining(["/reports", "/settings", "/semesters", "/timetable"]));
  });
  it("lets faculty log sessions and see academic setup read-only, but not reports or settings", () => {
    expect(paths("faculty")).toEqual(expect.arrayContaining(["/session-logs", "/semesters", "/subjects"]));
    expect(paths("faculty")).not.toContain("/reports");
    expect(paths("faculty")).not.toContain("/settings");
    expect(canLogSessions("faculty")).toBe(true);
  });
  it("keeps students read-only and away from semesters", () => {
    expect(paths("student")).toEqual(["/", "/calendar", "/exams", "/subjects", "/timetable", "/exam-readiness"]);
    expect(canLogSessions("student")).toBe(false);
  });
  it("has no duplicate sections", () => expect(new Set(paths("admin")).size).toBe(paths("admin").length));
});

describe("UI permission hints mirror the API matrix", () => {
  it("restricts writes", () => {
    expect(can("admin", "semesters:write")).toBe(true);
    expect(can("campus_manager", "semesters:write")).toBe(false);
    expect(can("campus_manager", "academic:write")).toBe(true);
    expect(can("faculty", "academic:write")).toBe(false);
    expect(can("student", "special_working_day:write")).toBe(false);
  });
});
