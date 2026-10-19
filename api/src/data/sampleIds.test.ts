import { describe, expect, it } from "vitest";
import { sessionLogCreate } from "../http/schemas.js";
import { buildSampleData } from "./sample.js";

describe("seeded ids are accepted by the API's own validation", () => {
  const d = buildSampleData();
  it("every sample timetable entry can be logged against (regression: 67-char University-track ids were rejected by a 64-char limit)", () => {
    expect(Math.max(...d.timetable.map((t) => t.id.length))).toBeGreaterThan(64); // the case that used to fail
    for (const t of d.timetable) {
      const r = sessionLogCreate.safeParse({ subjectId: t.subjectId, heldOn: "2026-10-05", timetableEntryId: t.id, outcome: "CANCELLED", notes: "Faculty on leave" });
      expect(r.success, `timetable id ${t.id}`).toBe(true);
    }
  });
  it("every sample subject, batch and faculty id is accepted too", () => {
    for (const s of d.subjects) expect(sessionLogCreate.safeParse({ subjectId: s.id, heldOn: "2026-10-05", outcome: "CANCELLED", notes: "x leave" }).success, s.id).toBe(true);
  });
});
