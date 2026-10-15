/** Deletes every row flagged isSample (and their syllabus/timetable). Real rows are never touched. */
import "../src/config/env.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const out = await prisma.$transaction([
    prisma.sessionLog.deleteMany({ where: { isSample: true } }), // cascades topic entries and revisions
    prisma.exam.deleteMany({ where: { isSample: true } }),
    prisma.calendarEntry.deleteMany({ where: { isSample: true } }),
    prisma.subject.deleteMany({ where: { isSample: true } }), // cascades timetable + syllabus
    prisma.batch.deleteMany({ where: { isSample: true } }),
    prisma.faculty.deleteMany({ where: { isSample: true } }),
    prisma.semester.deleteMany({ where: { isSample: true } }),
  ]);
  console.log("Removed sample rows:", { sessionLogs: out[0].count, exams: out[1].count, calendar: out[2].count, subjects: out[3].count, batches: out[4].count, faculty: out[5].count, semesters: out[6].count });
}

main().catch((e) => { console.error("Could not remove all sample data (real data may depend on it):", e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
