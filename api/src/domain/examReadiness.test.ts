import { describe, expect, it } from "vitest";
import { examPhase, examStatus, scopeModeFor, topicInExamScope } from "./examReadiness.js";

describe("exam readiness domain rules", () => {
  it("counts the whole syllabus when no topic is tagged, and says so", () => {
    expect(scopeModeFor([{ examScope: null }, { examScope: null }])).toBe("whole_syllabus");
    expect(topicInExamScope("whole_syllabus", "SESSIONAL", null)).toBe(true);
  });
  it("with tagged topics, an exam counts topics first assessed by it or an earlier exam; untagged topics are left out", () => {
    const mode = scopeModeFor([{ examScope: "SESSIONAL" }, { examScope: null }]);
    expect(mode).toBe("exam_scope");
    expect(topicInExamScope(mode, "SESSIONAL", "SESSIONAL")).toBe(true);
    expect(topicInExamScope(mode, "SESSIONAL", "MID_TERM")).toBe(false);
    expect(topicInExamScope(mode, "MID_TERM", "SESSIONAL")).toBe(true);
    expect(topicInExamScope(mode, "END_TERM", "PUT")).toBe(true);
    expect(topicInExamScope(mode, "END_TERM", null)).toBe(false);
  });
  it("the exam's status is its worst subject's: unknown beats on-track, and no subjects means no status at all", () => {
    expect(examStatus(["ON_TRACK", "DANGER", "COMPLETE"])).toBe("DANGER");
    expect(examStatus(["ON_TRACK", "UNKNOWN"])).toBe("UNKNOWN");
    expect(examStatus(["COMPLETE", "ON_TRACK"])).toBe("ON_TRACK");
    expect(examStatus([])).toBeNull();
  });
  it("an exam that has started is under way", () => {
    expect(examPhase("2026-10-26", "2026-10-26")).toBe("in_progress");
    expect(examPhase("2026-10-25", "2026-10-26")).toBe("upcoming");
  });
});
