import { describe, expect, it, beforeEach } from "vitest";
import {
  clearReminderAuditLog,
  computeReminders,
  dispatchReminders,
  getReminderAuditLog,
} from "./reminders.js";
import type { ScheduleItem } from "./scheduleData.js";

const makeItem = (date: string, key = `slot_${date}`, facultyName = "Prof. Turing"): ScheduleItem => ({
  key,
  kind: "scheduled",
  date,
  subjectId: "sub_1",
  subjectCode: "CS101",
  subjectName: "Introduction to CS",
  batchId: "batch_1",
  batchName: "Batch A",
  semesterId: "sem_1",
  campusId: "hi-tech",
  track: "MIRAI",
  facultyId: "fac_1",
  facultyName,
  entryId: "entry_1",
  makeupOfLogId: null,
  startTime: "09:00",
  endTime: "10:00",
  hours: 1,
  room: "101",
  log: null,
});

describe("missed-log reminders & campus manager escalation", () => {
  beforeEach(() => {
    clearReminderAuditLog();
  });

  it("sends faculty reminder for a class missed 24h ago (yesterday)", () => {
    const item = makeItem("2026-10-19");
    const reminders = computeReminders([item], "2026-10-20");

    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      tier: "FACULTY_REMINDER",
      recipientRole: "FACULTY",
      recipientTarget: "Prof. Turing",
      hoursElapsed: 24,
      isDeduplicated: false,
    });
    expect(reminders[0]!.message).toContain("REMINDER: Please record your session log");
  });

  it("escalates to Campus Manager after 48 hours", () => {
    const item = makeItem("2026-10-17"); // 3 days ago = 72 hours
    const reminders = computeReminders([item], "2026-10-20");

    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      tier: "MANAGER_ESCALATION",
      recipientRole: "CAMPUS_MANAGER",
      recipientTarget: "Campus Manager (hi-tech)",
      hoursElapsed: 72,
      isDeduplicated: false,
    });
    expect(reminders[0]!.message).toContain("ESCALATION:");
  });

  it("prevents duplicate reminders and preserves audit log", () => {
    const item = makeItem("2026-10-19");

    // First dispatch
    const res1 = dispatchReminders([item], "2026-10-20");
    expect(res1.dispatched).toHaveLength(1);
    expect(res1.skippedDuplicates).toBe(0);

    const audit = getReminderAuditLog();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      sessionKey: item.key,
      tier: "FACULTY_REMINDER",
      recipientRole: "FACULTY",
    });

    // Second dispatch with same item -> deduplicated
    const res2 = dispatchReminders([item], "2026-10-20");
    expect(res2.dispatched).toHaveLength(0);
    expect(res2.skippedDuplicates).toBe(1);

    // Audit log count remains 1
    expect(getReminderAuditLog()).toHaveLength(1);
  });
});
