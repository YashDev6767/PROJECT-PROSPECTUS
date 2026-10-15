import { describe, expect, it } from "vitest";
import { daysLabel, hours, longDate, shortDate } from "./format";

describe("format", () => {
  it("formats dates without timezone drift", () => {
    expect(shortDate("2026-11-02")).toBe("2 Nov");
    expect(longDate("2026-10-16")).toMatch(/^Friday,? 16 October$/); // ICU versions differ on the comma
  });
  it("formats hours and day distances", () => {
    expect(hours(6)).toBe("6 h");
    expect(hours(1.5)).toBe("1.5 h");
    expect(daysLabel(0)).toBe("Today");
    expect(daysLabel(17)).toBe("In 17 days");
  });
});
