import { describe, expect, it } from "vitest";
import { daysBetween, evaluateSubject } from "./progression.js";

const base = { plannedHours: 60, plannedHoursToDate: 30, deliveredHours: 30, hoursPerWeek: 4, daysToExam: 70 };

describe("evaluateSubject", () => {
  it("marks a subject on track when delivery matches the plan", () => {
    const r = evaluateSubject(base);
    expect(r.risk).toBe("on_track");
    expect(r.coveragePct).toBe(50);
    expect(r.hoursBehind).toBe(0);
  });

  it("marks at risk when coverage trails the plan by 10 percentage points or more", () => {
    const r = evaluateSubject({ ...base, deliveredHours: 24 }); // 40% vs 50%
    expect(r.risk).toBe("at_risk");
    expect(r.hoursBehind).toBe(6);
  });

  it("does not flag a gap just under the threshold", () => {
    expect(evaluateSubject({ ...base, deliveredHours: 25 }).risk).toBe("on_track"); // 41.7% vs 50% = 8.3pt
  });

  it("marks critical when remaining hours exceed capacity before the exam", () => {
    const r = evaluateSubject({ ...base, deliveredHours: 20, daysToExam: 14 }); // 40h left, 8h capacity
    expect(r.risk).toBe("critical");
    expect(r.capacityBeforeExam).toBe(8);
  });

  it("ignores capacity when no exam is scheduled", () => {
    const r = evaluateSubject({ ...base, daysToExam: null });
    expect(r.capacityBeforeExam).toBeNull();
    expect(r.risk).toBe("on_track");
  });

  it("clamps over-delivery to 100% and never reports negative hours behind", () => {
    const r = evaluateSubject({ ...base, deliveredHours: 80 });
    expect(r.coveragePct).toBe(100);
    expect(r.remainingHours).toBe(0);
    expect(r.hoursBehind).toBe(0);
  });

  it("rejects invalid input", () => {
    expect(() => evaluateSubject({ ...base, plannedHours: 0 })).toThrow(RangeError);
    expect(() => evaluateSubject({ ...base, deliveredHours: -1 })).toThrow(RangeError);
  });
});

describe("daysBetween", () => {
  it("counts whole calendar days regardless of time of day", () => {
    expect(daysBetween(new Date("2026-10-16T23:59:00Z"), new Date("2026-10-18T00:01:00Z"))).toBe(2);
    expect(daysBetween(new Date("2026-10-16T00:00:00Z"), new Date("2026-10-16T12:00:00Z"))).toBe(0);
  });
});
