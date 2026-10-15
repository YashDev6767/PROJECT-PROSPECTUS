-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CAMPUS_MANAGER', 'FACULTY', 'STUDENT');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PLANNED', 'DELIVERED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Track" AS ENUM ('MIRAI', 'UNIVERSITY');

-- CreateEnum
CREATE TYPE "SaturdayRule" AS ENUM ('ALL', 'NONE', 'SECOND_FOURTH');

-- CreateEnum
CREATE TYPE "CalendarCategory" AS ENUM ('HOLIDAY', 'EVENT', 'EXAM', 'ACADEMIC_DEADLINE', 'SPECIAL_WORKING_DAY');

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('SESSIONAL', 'MID_TERM', 'PUT', 'END_TERM');

-- CreateTable
CREATE TABLE "Campus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,

    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "campusId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "track" "Track" NOT NULL,
    "campusId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "saturdayRule" "SaturdayRule" NOT NULL DEFAULT 'SECOND_FOURTH',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "studentCount" INTEGER,
    "isSample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faculty" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "campusId" TEXT NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Faculty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "facultyId" TEXT,
    "plannedHours" DOUBLE PRECISION,
    "isSample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyllabusUnit" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "SyllabusUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyllabusTopic" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "plannedHours" DOUBLE PRECISION NOT NULL,
    "examScope" "ExamType",

    CONSTRAINT "SyllabusTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableEntry" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT,

    CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEntry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "CalendarCategory" NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "campusId" TEXT,
    "description" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ExamType" NOT NULL,
    "semesterId" TEXT NOT NULL,
    "batchId" TEXT,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "notes" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionLog" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "loggedById" TEXT NOT NULL,
    "heldOn" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(4,2) NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'DELIVERED',
    "topics" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campus_name_key" ON "Campus"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Semester_campusId_track_idx" ON "Semester"("campusId", "track");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_campusId_track_name_key" ON "Semester"("campusId", "track", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_semesterId_name_key" ON "Batch"("semesterId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Faculty_email_key" ON "Faculty"("email");

-- CreateIndex
CREATE INDEX "Faculty_campusId_idx" ON "Faculty"("campusId");

-- CreateIndex
CREATE INDEX "Subject_facultyId_idx" ON "Subject"("facultyId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_batchId_code_key" ON "Subject"("batchId", "code");

-- CreateIndex
CREATE INDEX "SyllabusUnit_subjectId_position_idx" ON "SyllabusUnit"("subjectId", "position");

-- CreateIndex
CREATE INDEX "SyllabusTopic_unitId_position_idx" ON "SyllabusTopic"("unitId", "position");

-- CreateIndex
CREATE INDEX "TimetableEntry_subjectId_idx" ON "TimetableEntry"("subjectId");

-- CreateIndex
CREATE INDEX "TimetableEntry_weekday_idx" ON "TimetableEntry"("weekday");

-- CreateIndex
CREATE INDEX "CalendarEntry_startsOn_endsOn_idx" ON "CalendarEntry"("startsOn", "endsOn");

-- CreateIndex
CREATE INDEX "CalendarEntry_campusId_idx" ON "CalendarEntry"("campusId");

-- CreateIndex
CREATE INDEX "Exam_semesterId_startsOn_idx" ON "Exam"("semesterId", "startsOn");

-- CreateIndex
CREATE INDEX "SessionLog_subjectId_heldOn_idx" ON "SessionLog"("subjectId", "heldOn");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faculty" ADD CONSTRAINT "Faculty_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyllabusUnit" ADD CONSTRAINT "SyllabusUnit_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyllabusTopic" ADD CONSTRAINT "SyllabusTopic_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SyllabusUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reference data: the four MSOT campuses (idempotent; also upserted by `npm run db:seed`).
INSERT INTO "Campus" ("id", "name") VALUES
  ('hi-tech', 'HI-Tech'),
  ('ratnam', 'Ratnam'),
  ('rgib', 'RGIB'),
  ('juj', 'JUJ')
ON CONFLICT ("id") DO NOTHING;
