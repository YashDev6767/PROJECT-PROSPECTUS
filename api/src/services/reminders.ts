import { addDays, daysBetweenISO } from "../domain/dates.js";
import { today } from "../domain/clock.js";
import type { ScheduleItem } from "./scheduleData.js";

export type ReminderTier = "FACULTY_REMINDER" | "MANAGER_ESCALATION";

export interface ReminderAuditRecord {
  id: string;
  sessionKey: string;
  heldOn: string;
  subjectName: string;
  batchName: string;
  facultyId: string | null;
  facultyName: string | null;
  campusId: string;
  tier: ReminderTier;
  recipientRole: "FACULTY" | "CAMPUS_MANAGER";
  recipientTarget: string;
  message: string;
  dispatchedAt: string;
}

export interface ComputedReminder {
  sessionKey: string;
  heldOn: string;
  subjectName: string;
  batchName: string;
  facultyId: string | null;
  facultyName: string | null;
  campusId: string;
  hoursElapsed: number;
  tier: ReminderTier;
  recipientRole: "FACULTY" | "CAMPUS_MANAGER";
  recipientTarget: string;
  message: string;
  isDeduplicated: boolean;
}

// In-memory persistent audit log for reminders dispatched in this process
const reminderAuditLog: ReminderAuditRecord[] = [];

export function getReminderAuditLog(): ReminderAuditRecord[] {
  return [...reminderAuditLog];
}

export function clearReminderAuditLog(): void {
  reminderAuditLog.length = 0;
}

/**
 * Computes reminders for past unlogged sessions.
 * - End-of-day reminder for missing logs < 48 hours old (targeted to faculty member).
 * - Escalation to the Campus Manager for missing logs >= 48 hours old.
 */
export function computeReminders(
  unloggedItems: ScheduleItem[],
  referenceDate = today(),
  auditLog: ReminderAuditRecord[] = reminderAuditLog,
): ComputedReminder[] {
  const dispatchedSet = new Set(auditLog.map((r) => `${r.sessionKey}:${r.tier}`));

  return unloggedItems.map((item) => {
    const elapsedDays = Math.max(0, daysBetweenISO(item.date, referenceDate));
    const hoursElapsed = elapsedDays * 24;
    const isEscalation = hoursElapsed >= 48;
    const tier: ReminderTier = isEscalation ? "MANAGER_ESCALATION" : "FACULTY_REMINDER";
    const recipientRole = isEscalation ? "CAMPUS_MANAGER" : "FACULTY";
    const recipientTarget = isEscalation
      ? `Campus Manager (${item.campusId})`
      : item.facultyName ?? item.facultyId ?? "Assigned Faculty";

    const message = isEscalation
      ? `ESCALATION: Class "${item.subjectName}" (${item.batchName}) on ${item.date} remains unlogged after ${hoursElapsed}h. Immediate attention required by ${item.campusId} campus leadership.`
      : `REMINDER: Please record your session log for "${item.subjectName}" (${item.batchName}) held on ${item.date}. Progress tracking is paused until logged.`;

    const isDeduplicated = dispatchedSet.has(`${item.key}:${tier}`);

    return {
      sessionKey: item.key,
      heldOn: item.date,
      subjectName: item.subjectName,
      batchName: item.batchName,
      facultyId: item.facultyId,
      facultyName: item.facultyName,
      campusId: item.campusId,
      hoursElapsed,
      tier,
      recipientRole,
      recipientTarget,
      message,
      isDeduplicated,
    };
  });
}

/**
 * Dispatches pending reminders with deduplication.
 * Returns newly dispatched audit records.
 */
export function dispatchReminders(
  unloggedItems: ScheduleItem[],
  referenceDate = today(),
): { dispatched: ReminderAuditRecord[]; skippedDuplicates: number } {
  const computed = computeReminders(unloggedItems, referenceDate, reminderAuditLog);
  const now = new Date().toISOString();
  const newlyDispatched: ReminderAuditRecord[] = [];
  let skippedDuplicates = 0;

  for (const c of computed) {
    if (c.isDeduplicated) {
      skippedDuplicates++;
      continue;
    }

    const record: ReminderAuditRecord = {
      id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionKey: c.sessionKey,
      heldOn: c.heldOn,
      subjectName: c.subjectName,
      batchName: c.batchName,
      facultyId: c.facultyId,
      facultyName: c.facultyName,
      campusId: c.campusId,
      tier: c.tier,
      recipientRole: c.recipientRole,
      recipientTarget: c.recipientTarget,
      message: c.message,
      dispatchedAt: now,
    };

    reminderAuditLog.push(record);
    newlyDispatched.push(record);
  }

  return { dispatched: newlyDispatched, skippedDuplicates };
}
