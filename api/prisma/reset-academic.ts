/** TEST/DEV ONLY: wipes ALL academic-setup tables (real and sample). Used by the e2e runner on the test database. */
import "../src/config/env.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
prisma.$executeRawUnsafe(`TRUNCATE "SessionTopicEntry","SessionLogRevision","SessionLog","Exam","CalendarEntry","TimetableEntry","SyllabusTopic","SyllabusUnit","Subject","Batch","Faculty","Semester" RESTART IDENTITY CASCADE`)
  .then(() => console.log("Academic tables reset."))
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
