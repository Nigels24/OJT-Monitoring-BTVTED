-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'TRANSFERRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "trainingAssignmentId" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "trainingAssignmentId" TEXT;

-- AlterTable
ALTER TABLE "Evaluation" ADD COLUMN     "trainingAssignmentId" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "blockId" TEXT,
ADD COLUMN     "courseId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseRequirement" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "yearLevel" INTEGER NOT NULL,
    "requiredHours" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "yearLevel" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "coordinatorId" TEXT,
    "academicYear" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAssignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "courseRequirementId" TEXT,
    "blockId" TEXT,
    "yearLevel" INTEGER NOT NULL,
    "requiredHours" INTEGER NOT NULL,
    "dutyDays" "Weekday"[],
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "academicYear" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "coordinatorGrade" DECIMAL(5,2),
    "coordinatorGradeRemarks" TEXT,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CourseRequirement_courseId_yearLevel_key" ON "CourseRequirement"("courseId", "yearLevel");

-- CreateIndex
CREATE UNIQUE INDEX "Block_courseId_yearLevel_name_academicYear_key" ON "Block"("courseId", "yearLevel", "name", "academicYear");

-- CreateIndex
CREATE INDEX "TrainingAssignment_studentId_status_idx" ON "TrainingAssignment"("studentId", "status");

-- CreateIndex
CREATE INDEX "Attendance_trainingAssignmentId_idx" ON "Attendance"("trainingAssignmentId");

-- CreateIndex
CREATE INDEX "Document_trainingAssignmentId_idx" ON "Document"("trainingAssignmentId");

-- CreateIndex
CREATE INDEX "Evaluation_trainingAssignmentId_idx" ON "Evaluation"("trainingAssignmentId");

-- AddForeignKey
ALTER TABLE "CourseRequirement" ADD CONSTRAINT "CourseRequirement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "Coordinator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_courseRequirementId_fkey" FOREIGN KEY ("courseRequirementId") REFERENCES "CourseRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "Coordinator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_trainingAssignmentId_fkey" FOREIGN KEY ("trainingAssignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_trainingAssignmentId_fkey" FOREIGN KEY ("trainingAssignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_trainingAssignmentId_fkey" FOREIGN KEY ("trainingAssignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every pre-existing user is exempt from the forced password
-- change the new column defaults new rows into. Runs after the ADD COLUMN
-- above, inside the same migration transaction, so it only ever touches rows
-- that existed before this migration.
UPDATE "User" SET "mustChangePassword" = false;

-- Backfill: one ACTIVE TrainingAssignment per Student who already has an
-- establishment, carrying over their current establishment/hours/dates so
-- Attendance/Document/Evaluation have something to attach to below.
--
-- yearLevel: Student.yearLevel is free text (e.g. "4th Year"); this takes the
-- first digit character and falls back to 4 (BTVTED-CHS's OJT year) when
-- there isn't one. A guess — there is no reliable structured source today.
--
-- startDate: required on TrainingAssignment but nullable on Student. Falls
-- back to "now" for the rare student missing one, which is a guess; a
-- coordinator should correct these rows by hand after review (see the report
-- for this step).
--
-- dutyDays: no historical source for this at all, so every backfilled row
-- gets the Mon-Fri default named in the handoff.
--
-- academicYear: hardcoded '2025-2026' — the current year, and the only one
-- any existing assignment could plausibly belong to.
--
-- gen_random_uuid(): built into PostgreSQL 13+ (Supabase runs 15+), used here
-- instead of Prisma's cuid() because this is raw SQL, not a Prisma Client
-- write. The id format differs from app-created rows but String columns
-- don't care.
INSERT INTO "TrainingAssignment" (
  "id", "studentId", "establishmentId", "courseRequirementId", "blockId",
  "yearLevel", "requiredHours", "dutyDays", "startDate", "endDate",
  "academicYear", "status", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  s."id",
  s."establishmentId",
  NULL,
  NULL,
  COALESCE((substring(s."yearLevel" from '\d'))::int, 4),
  s."requiredHours",
  ARRAY['MON', 'TUE', 'WED', 'THU', 'FRI']::"Weekday"[],
  COALESCE(s."startDate", now()),
  s."endDate",
  '2025-2026',
  'ACTIVE',
  now(),
  now()
FROM "Student" s
WHERE s."establishmentId" IS NOT NULL;

-- Point each backfilled student's existing rows at the assignment just
-- created for them. Safe as a plain studentId join: this migration is the
-- only thing that has ever created a TrainingAssignment, so each student
-- backfilled above has exactly one.
UPDATE "Attendance" a
SET "trainingAssignmentId" = ta."id"
FROM "TrainingAssignment" ta
WHERE ta."studentId" = a."studentId";

UPDATE "Document" d
SET "trainingAssignmentId" = ta."id"
FROM "TrainingAssignment" ta
WHERE ta."studentId" = d."studentId";

UPDATE "Evaluation" e
SET "trainingAssignmentId" = ta."id"
FROM "TrainingAssignment" ta
WHERE ta."studentId" = e."studentId";
