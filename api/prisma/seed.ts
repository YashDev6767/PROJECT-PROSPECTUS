/**
 * Seeds SAMPLE academic-setup data (flagged isSample) into PostgreSQL. Safe to re-run: rows have deterministic ids and
 * duplicates are skipped. Remove it again with `npm run db:clear-sample`.
 *   npm run db:migrate   (or db:deploy) first, then   npm run db:seed
 */
import "../src/config/env.js";
import { PrismaClient } from "@prisma/client";
import { campuses } from "../src/data/campuses.js";
import { buildSampleData } from "../src/data/sample.js";
import { dbDate } from "../src/services/format.js";

const prisma = new PrismaClient();

async function main() {
  for (const c of campuses) await prisma.campus.upsert({ where: { id: c.id }, update: { name: c.name }, create: { id: c.id, name: c.name } });
  const d = buildSampleData();
  const added: Record<string, number> = {};
  const run = async (label: string, p: Promise<{ count: number }>) => { added[label] = (await p).count; };

  await run("semesters", prisma.semester.createMany({ skipDuplicates: true, data: d.semesters.map((s) => ({ ...s, startsOn: dbDate(s.startsOn), endsOn: dbDate(s.endsOn), isSample: true })) }));
  await run("faculty", prisma.faculty.createMany({ skipDuplicates: true, data: d.faculty.map((f) => ({ ...f, isSample: true })) }));
  await run("batches", prisma.batch.createMany({ skipDuplicates: true, data: d.batches.map((b) => ({ ...b, isSample: true })) }));
  await run("subjects", prisma.subject.createMany({ skipDuplicates: true, data: d.subjects.map((s) => ({ ...s, isSample: true })) }));
  await run("timetable", prisma.timetableEntry.createMany({ skipDuplicates: true, data: d.timetable }));
  await run("units", prisma.syllabusUnit.createMany({ skipDuplicates: true, data: d.units }));
  await run("topics", prisma.syllabusTopic.createMany({ skipDuplicates: true, data: d.topics }));
  await run("sessionLogs", prisma.sessionLog.createMany({ skipDuplicates: true, data: d.sessionLogs.map((l) => ({ ...l, heldOn: dbDate(l.heldOn), rescheduledTo: l.rescheduledTo ? dbDate(l.rescheduledTo) : null, loggedByRole: "sample", isSample: true })) }));
  await run("topicEntries", prisma.sessionTopicEntry.createMany({ skipDuplicates: true, data: d.topicEntries }));
  await run("calendar", prisma.calendarEntry.createMany({ skipDuplicates: true, data: d.calendar.map((e) => ({ ...e, startsOn: dbDate(e.startsOn), endsOn: dbDate(e.endsOn), isSample: true })) }));
  await run("exams", prisma.exam.createMany({ skipDuplicates: true, data: d.exams.map((e) => ({ ...e, startsOn: dbDate(e.startsOn), endsOn: dbDate(e.endsOn), isSample: true })) }));
  console.log("Newly inserted sample rows (0 means already seeded):", added);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
