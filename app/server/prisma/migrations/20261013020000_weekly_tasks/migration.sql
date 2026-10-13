-- CreateEnum
CREATE TYPE "WeeklyTaskStatus" AS ENUM ('ASSIGNED', 'DONE', 'RATED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'WEEKLY_TASK_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'WEEKLY_TASK_DONE';
ALTER TYPE "NotificationType" ADD VALUE 'WEEKLY_TASK_RATED';

-- CreateTable
CREATE TABLE "WeeklyTask" (
    "id" TEXT NOT NULL,
    "trainingAssignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "supervisorId" TEXT,
    "weekStart" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATE NOT NULL,
    "status" "WeeklyTaskStatus" NOT NULL DEFAULT 'ASSIGNED',
    "doneAt" TIMESTAMP(3),
    "studentNote" TEXT,
    "rating" INTEGER,
    "ratingComment" TEXT,
    "ratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyTaskPhoto" (
    "id" TEXT NOT NULL,
    "weeklyTaskId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyTaskPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyTask_trainingAssignmentId_weekStart_idx" ON "WeeklyTask"("trainingAssignmentId", "weekStart");

-- CreateIndex
CREATE INDEX "WeeklyTask_studentId_weekStart_idx" ON "WeeklyTask"("studentId", "weekStart");

-- CreateIndex
CREATE INDEX "WeeklyTaskPhoto_weeklyTaskId_idx" ON "WeeklyTaskPhoto"("weeklyTaskId");

-- AddForeignKey
ALTER TABLE "WeeklyTask" ADD CONSTRAINT "WeeklyTask_trainingAssignmentId_fkey" FOREIGN KEY ("trainingAssignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyTask" ADD CONSTRAINT "WeeklyTask_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyTask" ADD CONSTRAINT "WeeklyTask_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Supervisor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyTaskPhoto" ADD CONSTRAINT "WeeklyTaskPhoto_weeklyTaskId_fkey" FOREIGN KEY ("weeklyTaskId") REFERENCES "WeeklyTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

