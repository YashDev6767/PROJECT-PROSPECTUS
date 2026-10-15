-- Phase 3: session logs and per-topic progress entries.
-- Non-destructive for the Phase 1 "SessionLog" table: existing rows (if any) are migrated, not dropped:
--   status DELIVERED -> COMPLETED, MISSED -> SKIPPED, CANCELLED -> CANCELLED, PLANNED (never held) -> SKIPPED
--   hours -> actualHours (capped at 24), topics text -> appended to notes, heldOn timestamp -> date.

-- CreateEnum
CREATE TYPE "SessionOutcome" AS ENUM ('COMPLETED', 'IN_PROGRESS', 'SKIPPED', 'MERGED', 'CANCELLED');
CREATE TYPE "WorkStatus" AS ENUM ('NOT_GIVEN', 'GIVEN', 'REVIEWED');
CREATE TYPE "TopicEntryKind" AS ENUM ('COVERED', 'LEFTOVER', 'SKIPPED');

-- DropForeignKey (re-added below as nullable / SET NULL)
ALTER TABLE "SessionLog" DROP CONSTRAINT "SessionLog_loggedById_fkey";

-- AlterTable: add new columns first so old data can be carried over
ALTER TABLE "SessionLog"
  ADD COLUMN "actualHours" DOUBLE PRECISION,
  ADD COLUMN "carryForward" TEXT,
  ADD COLUMN "classworkStatus" "WorkStatus" NOT NULL DEFAULT 'NOT_GIVEN',
  ADD COLUMN "homeworkStatus" "WorkStatus" NOT NULL DEFAULT 'NOT_GIVEN',
  ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "loggedByFacultyId" TEXT,
  ADD COLUMN "loggedByRole" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "makeupOfId" TEXT,
  ADD COLUMN "mergedIntoId" TEXT,
  ADD COLUMN "outcome" "SessionOutcome",
  ADD COLUMN "rescheduledTo" DATE,
  ADD COLUMN "reviewNote" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByRole" TEXT,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "scheduledHours" DOUBLE PRECISION,
  ADD COLUMN "slotEnd" TEXT,
  ADD COLUMN "slotStart" TEXT,
  ADD COLUMN "timetableEntryId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "SessionLog" SET
  "outcome" = (CASE "status"::text WHEN 'DELIVERED' THEN 'COMPLETED' WHEN 'CANCELLED' THEN 'CANCELLED' ELSE 'SKIPPED' END)::"SessionOutcome",
  "actualHours" = CASE WHEN "hours" > 0 THEN LEAST("hours", 24)::double precision END,
  "notes" = CASE WHEN COALESCE("topics", '') <> '' THEN COALESCE("notes" || E'\n', '') || 'Topics (migrated): ' || "topics" ELSE "notes" END;

ALTER TABLE "SessionLog"
  ALTER COLUMN "outcome" SET NOT NULL,
  ALTER COLUMN "loggedByRole" DROP DEFAULT,
  ALTER COLUMN "updatedAt" DROP DEFAULT,
  ALTER COLUMN "loggedById" DROP NOT NULL,
  ALTER COLUMN "heldOn" SET DATA TYPE DATE USING ("heldOn"::date),
  DROP COLUMN "hours",
  DROP COLUMN "status",
  DROP COLUMN "topics";

-- DropEnum
DROP TYPE "SessionStatus";

-- CreateTable
CREATE TABLE "SessionTopicEntry" (
    "id" TEXT NOT NULL,
    "sessionLogId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "kind" "TopicEntryKind" NOT NULL,
    "completionPct" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SessionTopicEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessionLogRevision" (
    "id" TEXT NOT NULL,
    "sessionLogId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" TEXT NOT NULL,
    "changedByRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionLogRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionTopicEntry_topicId_idx" ON "SessionTopicEntry"("topicId");
CREATE UNIQUE INDEX "SessionTopicEntry_sessionLogId_topicId_key" ON "SessionTopicEntry"("sessionLogId", "topicId");
CREATE UNIQUE INDEX "SessionLogRevision_sessionLogId_revision_key" ON "SessionLogRevision"("sessionLogId", "revision");
CREATE UNIQUE INDEX "SessionLog_makeupOfId_key" ON "SessionLog"("makeupOfId");
CREATE INDEX "SessionLog_heldOn_idx" ON "SessionLog"("heldOn");
-- one log per scheduled session (NULL entry ids — extra/make-up sessions — are not constrained)
CREATE UNIQUE INDEX "SessionLog_timetableEntryId_heldOn_key" ON "SessionLog"("timetableEntryId", "heldOn");

-- AddForeignKey
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_timetableEntryId_fkey" FOREIGN KEY ("timetableEntryId") REFERENCES "TimetableEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_makeupOfId_fkey" FOREIGN KEY ("makeupOfId") REFERENCES "SessionLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "SessionLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_loggedByFacultyId_fkey" FOREIGN KEY ("loggedByFacultyId") REFERENCES "Faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SessionTopicEntry" ADD CONSTRAINT "SessionTopicEntry_sessionLogId_fkey" FOREIGN KEY ("sessionLogId") REFERENCES "SessionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionTopicEntry" ADD CONSTRAINT "SessionTopicEntry_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "SyllabusTopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionLogRevision" ADD CONSTRAINT "SessionLogRevision_sessionLogId_fkey" FOREIGN KEY ("sessionLogId") REFERENCES "SessionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity rules the database enforces even if the API is bypassed (not expressible in Prisma schema)
ALTER TABLE "SessionTopicEntry" ADD CONSTRAINT "SessionTopicEntry_pct_chk"
  CHECK (("kind" = 'COVERED' AND "completionPct" BETWEEN 1 AND 100) OR ("kind" <> 'COVERED' AND "completionPct" = 0));
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_hours_chk"
  CHECK (("actualHours" IS NULL OR ("actualHours" > 0 AND "actualHours" <= 24)) AND ("scheduledHours" IS NULL OR "scheduledHours" > 0));
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_reschedule_chk" CHECK ("rescheduledTo" IS NULL OR "outcome" = 'CANCELLED');
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_merge_chk" CHECK ("mergedIntoId" IS NULL OR "outcome" = 'MERGED');
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_revision_chk" CHECK ("revision" >= 1);
